import { useState } from 'react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { isPublicWebBuild } from '@/bibliotecas/ambiente';
import { scopedStorageKey } from '@/bibliotecas/contas';
import { startCloudSync, stopCloudSync, syncCloudNow } from '@/servicos/ServicoSincronizacaoCloud';
import { Building2, KeyRound, Loader2, Lock, ShieldCheck, Eye, EyeOff } from 'lucide-react';

// Ecrã de ligação para a WEB PÚBLICA (Vercel).
// Substitui o onboarding aberto: um novo dispositivo só entra com o NIF da
// empresa (tenant) e a chave de sincronização fornecida pelo administrador
// (validada no servidor contra TANGO_SYNC_SECRET). Sem a chave, ninguém
// consegue criar contas nem descarregar dados — abordagem por convite (B2B).
export const LigacaoEmpresaWeb = () => {
    const { hasUsers } = useAuth();
    const { updateCompanySettings } = useData();
    const [tenant, setTenant] = useState('');
    const [passkey, setPasskey] = useState('');
    const [showPasskey, setShowPasskey] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState('');

    // Só aparece na web pública quando ainda não existem utilizadores locais
    // (sem utilizadores o login é impossível — este ecrã é o único caminho).
    if (!isPublicWebBuild || hasUsers) return null;

    const handleConnect = async () => {
        const cleanTenant = tenant.trim();
        const cleanPasskey = passkey.trim();
        if (!cleanTenant || cleanPasskey.length < 8) {
            setError('Indique o NIF da empresa e uma chave de sincronização com pelo menos 8 caracteres.');
            return;
        }

        setIsConnecting(true);
        setError('');
        try {
            // Este dispositivo é um recetor puro no arranque: marcar o bootstrap
            // como feito para não enviar dados locais vazios para a cloud.
            localStorage.setItem(scopedStorageKey('cloud_sync_bootstrap_v1'), 'true');

            const syncUrl = window.location.origin;
            startCloudSync({ url: syncUrl, apiKey: cleanPasskey, tenantId: cleanTenant });
            const result = await syncCloudNow();
            stopCloudSync();

            if (!result.success) {
                setError(result.message || 'Não foi possível ligar ao servidor. Verifique a chave de sincronização.');
                return;
            }
            if (!result.pulled) {
                setError('Nenhum dado encontrado para esta empresa. Confirme o NIF e se o computador principal já sincronizou.');
                return;
            }

            await updateCompanySettings({
                nif: cleanTenant,
                syncEnabled: true,
                syncUrl,
                syncPasskey: cleanPasskey
            });
            window.location.reload();
        } catch (e: any) {
            console.error('[LigacaoEmpresaWeb] Falha na ligação:', e);
            setError(e?.message || 'Falha inesperada ao ligar à empresa.');
        } finally {
            setIsConnecting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[10000] flex min-h-svh items-center justify-center overflow-y-auto bg-gradient-to-tr from-blue-50/70 via-slate-50 to-indigo-50/70 p-4 sm:p-6">
            <div className="w-full max-w-md space-y-6">
                <div className="flex flex-col items-center gap-3 text-center">
                    <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white shadow-lg shadow-blue-500/10 border border-slate-200/60">
                        <ShieldCheck className="h-8 w-8 text-[#2563eb]" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-slate-900">Tango Gestão de Créditos</h1>
                        <p className="mt-1 text-sm font-semibold text-slate-400">Acesso restrito — ligação à empresa</p>
                    </div>
                </div>

                <div className="w-full rounded-3xl border border-slate-200/60 bg-white/95 p-6 shadow-[0_30px_70px_-15px_rgba(30,41,59,0.15)] backdrop-blur-md sm:p-8">
                    <div className="mb-6 flex items-start gap-3 rounded-2xl bg-blue-50/70 p-4 text-xs font-semibold leading-relaxed text-slate-500">
                        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#2563eb]" />
                        <span>
                            Este dispositivo ainda não está autorizado. Introduza os dados de
                            ligação fornecidos pelo administrador da sua empresa.
                        </span>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="tenant" className="text-xs font-bold text-slate-400">NIF da Empresa</Label>
                            <div className="relative">
                                <Building2 className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    id="tenant"
                                    value={tenant}
                                    onChange={(e) => setTenant(e.target.value)}
                                    placeholder="Ex.: 5417000000"
                                    disabled={isConnecting}
                                    className="h-11 rounded-xl border-slate-200 bg-slate-50/50 pl-10 pr-4 text-slate-800 placeholder:text-slate-400 focus-visible:ring-[#2563eb]"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="passkey" className="text-xs font-bold text-slate-400">Chave de Sincronização</Label>
                            <div className="relative">
                                <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    id="passkey"
                                    type={showPasskey ? 'text' : 'password'}
                                    value={passkey}
                                    onChange={(e) => setPasskey(e.target.value)}
                                    placeholder="Chave fornecida pelo administrador"
                                    disabled={isConnecting}
                                    className="h-11 rounded-xl border-slate-200 bg-slate-50/50 pl-10 pr-11 text-slate-800 placeholder:text-slate-400 focus-visible:ring-[#2563eb]"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPasskey(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    tabIndex={-1}
                                >
                                    {showPasskey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <p className="rounded-xl bg-red-50 p-3 text-xs font-semibold leading-relaxed text-red-600">{error}</p>
                        )}

                        <Button
                            onClick={handleConnect}
                            disabled={isConnecting || !tenant.trim() || passkey.trim().length < 8}
                            className="h-12 w-full rounded-xl bg-[#2563eb] text-sm font-black text-white hover:bg-[#1d4ed8]"
                        >
                            {isConnecting ? (
                                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> A ligar e a descarregar dados…</span>
                            ) : (
                                'Ligar à Empresa'
                            )}
                        </Button>
                    </div>
                </div>

                <p className="text-center text-[11px] font-semibold text-slate-400">
                    Não tem os dados de ligação? Contacte o administrador do sistema.
                </p>
            </div>
        </div>
    );
};
