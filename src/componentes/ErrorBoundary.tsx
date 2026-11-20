import React, { Component, ErrorInfo, ReactNode, useEffect, useState } from 'react';
import { isChunkLoadError, isReloadPending, reloadForNewVersion } from '@/bibliotecas/carregamento-modulos';
import { confirmar } from '@/bibliotecas/alerta';

const ESPERA_SEGUNDOS = 10;

/**
 * Um ficheiro da aplicação não chegou (rede instável ou sem internet): não é um erro do sistema. Explica-o e
 * volta a tentar sozinho — quando a ligação voltar, se estiver sem internet, ou ao fim de alguns segundos.
 */
function LigacaoInstavel() {
    const [offline, setOffline] = useState(() => navigator.onLine === false);
    const [segundos, setSegundos] = useState(ESPERA_SEGUNDOS);
    useEffect(() => {
        const ligado = () => { setOffline(false); window.location.reload(); };
        const desligado = () => setOffline(true);
        window.addEventListener('online', ligado);
        window.addEventListener('offline', desligado);
        return () => { window.removeEventListener('online', ligado); window.removeEventListener('offline', desligado); };
    }, []);
    useEffect(() => {
        if (offline) return;
        if (segundos <= 0) { window.location.reload(); return; }
        const t = window.setTimeout(() => setSegundos(x => x - 1), 1000);
        return () => window.clearTimeout(t);
    }, [offline, segundos]);
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-amber-100 text-center">
                <h1 className="text-2xl font-black tracking-tight text-slate-900 mb-1">Tango Gestão de Créditos ERP</h1>
                <h2 className="text-lg font-bold text-amber-600 mb-2">{offline ? 'Sem ligação à internet' : 'Ligação instável'}</h2>
                <p className="text-slate-600 mb-6 font-medium text-sm">
                    {offline
                        ? 'Parte do sistema ainda não foi descarregada. Continua sozinho assim que a ligação voltar.'
                        : `Parte do sistema não chegou a ser descarregada. A tentar de novo em ${segundos} s…`}
                </p>
                <button onClick={() => window.location.reload()}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all active:scale-[0.98]">
                    Tentar agora
                </button>
            </div>
        </div>
    );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        // Página de uma versão anterior (depois de um deploy): recarrega para obter a versão nova.
        if (isChunkLoadError(error) && reloadForNewVersion()) this.forceUpdate();
    }

    render() {
        if (this.state.hasError && isReloadPending()) {
            // A aplicação está a recarregar para a versão nova: não mostra um erro que vai desaparecer.
            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-500">A atualizar a aplicação…</p>
                </div>
            );
        }

        if (this.state.hasError && isChunkLoadError(this.state.error)) return <LigacaoInstavel />;

        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
                    <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-red-100 text-center">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <span className="text-2xl"></span>
                        </div>
                        <h1 className="text-2xl font-black tracking-tight text-slate-900 mb-1">Tango Gestão de Créditos ERP</h1>
                        <h2 className="text-lg font-bold text-red-600 mb-2">Ops! Algo correu mal.</h2>
                        <p className="text-slate-600 mb-6 font-medium text-sm">O sistema encontrou um erro inesperado.</p>

                        <div className="bg-slate-50 rounded-xl p-4 mb-6 text-left overflow-auto max-h-40 border border-slate-100">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-widest">Detalhes do Erro</p>
                            <p className="text-xs font-mono text-red-600 break-all leading-relaxed">{this.state.error?.toString()}</p>
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={() => window.location.reload()}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-200 active:scale-[0.98]"
                            >
                                Reiniciar Sistema
                            </button>

                            <button
                                onClick={async () => {
                                    if (await confirmar("Isto irá apagar todas as sessões e configurações temporárias. O banco de dados permanecerá. Deseja continuar?")) {
                                        localStorage.clear();
                                        sessionStorage.clear();
                                        window.location.reload();
                                    }
                                }}
                                className="w-full py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-xl transition-all active:scale-[0.98] text-xs"
                            >
                                Limpar Cache e Forçar Reset
                            </button>
                        </div>

                        <p className="mt-8 text-[9px] text-slate-400 uppercase tracking-[0.2em] font-black">
                            DIGITAL NORTE - COMÉRCIO E PRESTAÇÃO DE SERVIÇOS, (SU), LDA • SEGURANÇA MÁXIMA
                        </p>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
