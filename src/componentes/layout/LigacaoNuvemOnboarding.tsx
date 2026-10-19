import { useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Cloud, Eye, EyeOff, KeyRound, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { useData } from '@/contextos/ContextoDados';
import { db } from '@/bibliotecas/bd';
import { cn } from '@/bibliotecas/utils';
import { readCompanyIdentity } from '@/bibliotecas/identidade-empresa-sync';
import { cleanCompanyNif, fetchCloudCompanyStatus, getKnownCloudServers } from '@/servicos/ServicoLigacaoNuvem';
import { getLastCloudSyncStatus, prepareCloudReceiver, receiveUsersFromCloud, startCloudSync, stopCloudSync, syncCloudNow } from '@/servicos/ServicoSincronizacaoCloud';

// Onboarding do executável, opção "Ligar a empresa na nuvem": o mesmo ecrã da versão web (NIF + Código de Acesso
// emitido pelo Tango Master Gen). O processo principal confirma o código no servidor e autoriza a recepção dos
// dados antes do primeiro login; o computador descarrega tudo (utilizadores incluídos) e segue para o login, sem
// configurar a empresa nem criar administrador.

type NifType = 'COLECTIVO' | 'SINGULAR';
type Phase = 'verify' | 'data' | 'users' | 'finish';

const PHASES: Array<{ id: Phase; label: string }> = [
    { id: 'verify', label: 'A verificar a empresa no servidor' },
    { id: 'data', label: 'A descarregar os dados da nuvem' },
    { id: 'users', label: 'A receber os utilizadores' },
    { id: 'finish', label: 'A concluir a configuração' },
];

const formatNIF = (value: string, type: NifType) => {
    const clean = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (type === 'COLECTIVO') return clean.slice(0, 10).replace(/[^0-9]/g, '');
    let formatted = '';
    for (let i = 0; i < clean.length && i < 14; i++) {
        const char = clean[i];
        if (i < 9) { if (/[0-9]/.test(char)) formatted += char; }
        else if (i < 11) { if (/[A-Z]/.test(char)) formatted += char; }
        else if (/[0-9]/.test(char)) formatted += char;
    }
    return formatted;
};

/** Sincroniza até não haver mais nada a receber (várias rondas: o servidor envia por páginas). */
const pullEverything = async () => {
    let pulled = 0;
    let failures = 0;
    for (let round = 0; round < 25; round++) {
        const result: any = await syncCloudNow();
        if (!result?.success) {
            if (++failures >= 3) throw new Error(result?.message || 'Não foi possível descarregar os dados da nuvem.');
            await new Promise(resolve => setTimeout(resolve, 1500));
            continue;
        }
        pulled += Number(result.pulled || 0);
        const status = getLastCloudSyncStatus();
        if (status.state === 'synced' || !result.pulled) break;
    }
    return pulled;
};

export function LigacaoNuvemOnboarding({ onBack, onLinked }: { onBack: () => void; onLinked: (summary: { companyName: string; pulled: number; users: number }) => void | Promise<void> }) {
    const { updateCompanySettings } = useData();
    const [stage, setStage] = useState<'identify' | 'access'>('identify');
    const [nifType, setNifType] = useState<NifType>('COLECTIVO');
    const [nif, setNif] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [accessCode, setAccessCode] = useState('');
    const [showCode, setShowCode] = useState(false);
    const [busy, setBusy] = useState(false);
    const [phase, setPhase] = useState<Phase | null>(null);
    const [error, setError] = useState('');
    const cleanNif = cleanCompanyNif(nif);

    const identify = async (event: React.FormEvent) => {
        event.preventDefault();
        if (cleanNif.length < 9) return;
        setBusy(true);
        setError('');
        try {
            const result = await fetchCloudCompanyStatus(cleanNif);
            if (!result) setError('Não foi possível verificar a empresa no servidor central. Verifique a ligação à Internet.');
            else if (result.status === 'not_registered') setError(`O NIF ${cleanNif} não está registado no Tango Master Gen. Volte atrás e escolha "Configuração do zero", ou peça o registo da empresa.`);
            else if (result.status === 'blocked') setError('O acesso desta empresa está suspenso no Tango Master Gen. Contacte o suporte (+244 941 537 486).');
            else if (result.status === 'expired') setError('A subscrição desta empresa expirou. Solicite a renovação no Tango Master Gen.');
            else {
                setCompanyName(result.companyName || '');
                setStage('access');
            }
        } finally {
            setBusy(false);
        }
    };

    const link = async (event: React.FormEvent) => {
        event.preventDefault();
        const api = window.electronAPI;
        if (!api?.cloudLinkBegin) { setError('Esta opção só está disponível na aplicação de computador.'); return; }
        const code = accessCode.trim().toUpperCase();
        if (code.length < 4) { setError('Introduza o Código de Acesso da empresa.'); return; }
        setBusy(true);
        setError('');
        let granted = false;
        try {
            setPhase('verify');
            const linked = await api.cloudLinkBegin({ nif: cleanNif, accessCode: code, urls: getKnownCloudServers() });
            granted = true;
            const tenantId = linked.tenantId;
            // Só o NIF por agora: a sincronização automática do sistema arranca apenas no fim, com tudo recebido.
            await updateCompanySettings({ nif: tenantId });

            setPhase('data');
            await prepareCloudReceiver({ tenantId, apiKey: linked.syncPasskey });
            startCloudSync({ url: linked.url, apiKey: linked.syncPasskey, tenantId, extraKeys: [code] });
            let pulled = 0;
            let users = 0;
            try {
                pulled = await pullEverything();
                setPhase('users');
                const roster = await receiveUsersFromCloud();
                if (roster.state === 'applied') pulled += 1;
                users = Number((await db.get<{ total: number }>('SELECT COUNT(*) AS total FROM users'))?.total || 0);
            } finally {
                stopCloudSync();
            }
            if (!users) {
                throw new Error('A empresa ainda não tem utilizadores na nuvem. Ligue primeiro o computador principal da empresa à versão web (ou crie os utilizadores na versão web) e tente de novo.');
            }

            setPhase('finish');
            const identity = await readCompanyIdentity(db, tenantId).catch(() => ({} as Record<string, string | null>));
            const name = String(identity.name || linked.companyName || companyName || tenantId);
            // Definições finais numa só gravação: a empresa fica configurada (nome e data de instalação) e a
            // sincronização passa a automática. Sem administrador novo: entra-se com os utilizadores da empresa.
            await updateCompanySettings({
                name,
                nif: tenantId,
                installDate: new Date().toISOString(),
                syncEnabled: true,
                syncUrl: linked.url,
                syncPasskey: linked.syncPasskey,
                syncApiKey: linked.syncPasskey,
                ...(typeof linked.multiTenant === 'boolean' ? { enableMultiTenant: linked.multiTenant } : {}),
            });
            await api.cloudLinkEnd?.().catch(() => undefined);
            granted = false;
            await onLinked({ companyName: name, pulled, users });
        } catch (err: any) {
            setError(String(err?.message || 'Não foi possível ligar à empresa na nuvem.').replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
        } finally {
            if (granted) await api.cloudLinkEnd?.().catch(() => undefined);
            setBusy(false);
            setPhase(null);
        }
    };

    const errorBox = error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 animate-in fade-in duration-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="leading-relaxed">{error}</p>
        </div>
    );
    const backButton = (label: string, action: () => void) => (
        <button type="button" onClick={action} disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 transition-colors hover:text-[#0f1c47] disabled:opacity-50">
            <ArrowLeft className="h-3.5 w-3.5" /> {label}
        </button>
    );

    return (
        <div className="mx-auto flex w-full max-w-md flex-col gap-5 py-2 animate-fade-in">
            {stage === 'identify' ? (
                <form onSubmit={identify} className="space-y-5">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        {backButton('Voltar', onBack)}
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-bold text-[#0f1c47]">Passo 1 de 2 · Identificação</span>
                    </div>
                    <div className="space-y-1">
                        <h3 className="flex items-center gap-2 text-2xl font-black tracking-tight text-slate-900"><Cloud className="h-6 w-6 text-blue-600" /> Identificar Empresa</h3>
                        <p className="text-xs leading-relaxed text-slate-500">Indique o NIF da organização para consultarmos o registo no servidor central (Tango Master Gen).</p>
                    </div>
                    {errorBox}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">Tipo de contribuinte</Label>
                            <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
                                {(['COLECTIVO', 'SINGULAR'] as const).map(type => (
                                    <button key={type} type="button" onClick={() => { setNifType(type); setNif(''); setError(''); }}
                                        className={cn('rounded-lg px-3 py-1 text-xs font-bold transition-all', nifType === type ? 'bg-[#0f1c47] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
                                        {type === 'COLECTIVO' ? 'Empresa (NIF)' : 'Particular (BI)'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="cloud-onboarding-nif" className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                <Building2 className="h-3.5 w-3.5 text-[#0f1c47]" /> NIF da Empresa
                            </Label>
                            <Input id="cloud-onboarding-nif" value={nif} autoFocus disabled={busy} placeholder={nifType === 'COLECTIVO' ? 'Ex.: 5417000000' : '000000000XX000'}
                                onChange={e => { setNif(formatNIF(e.target.value, nifType)); setError(''); }}
                                className="h-11 rounded-xl border-slate-200 bg-slate-50 px-3.5 font-mono text-sm font-bold text-slate-900" />
                        </div>
                    </div>
                    <Button type="submit" disabled={busy || cleanNif.length < 9} className="h-12 w-full gap-2 rounded-xl bg-[#0f1c47] text-sm font-bold text-white hover:bg-[#182b6b]">
                        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> A verificar no servidor…</> : <>Continuar <ArrowRight className="h-4 w-4" /></>}
                    </Button>
                </form>
            ) : (
                <form onSubmit={link} className="space-y-5">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        {backButton('Alterar NIF', () => { setStage('identify'); setError(''); })}
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-bold text-[#0f1c47]">Passo 2 de 2 · Autorização</span>
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-2xl font-black tracking-tight text-slate-900">{companyName || 'Código de Acesso'}</h3>
                        <p className="text-xs leading-relaxed text-slate-500">Empresa identificada. Introduza o Código de Acesso para autorizar este computador.</p>
                    </div>
                    {errorBox}
                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                        <div>
                            <p className="font-bold text-emerald-900">Empresa Registada</p>
                            <p className="text-slate-600">NIF <span className="font-mono font-bold text-slate-900">{cleanNif}</span></p>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="cloud-onboarding-code" className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                            <KeyRound className="h-3.5 w-3.5 text-[#0f1c47]" /> Código de Acesso da empresa
                        </Label>
                        <div className="relative">
                            <Input id="cloud-onboarding-code" type={showCode ? 'text' : 'password'} value={accessCode} autoComplete="off" autoFocus disabled={busy}
                                placeholder="Ex.: TG-8492-3105" onChange={e => { setAccessCode(e.target.value.toUpperCase()); setError(''); }}
                                className="h-11 rounded-xl border-slate-200 bg-slate-50 pr-11 font-mono text-base font-bold tracking-wider text-[#0f1c47]" />
                            <button type="button" tabIndex={-1} onClick={() => setShowCode(value => !value)} aria-label={showCode ? 'Ocultar código' : 'Mostrar código'}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700">
                                {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        <p className="text-[11px] leading-relaxed text-slate-500">Emitido pelo Tango Master Gen. É o mesmo código usado para entrar na versão web.</p>
                    </div>
                    {phase && (
                        <ol className="space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs" aria-live="polite">
                            {PHASES.map((item, index) => {
                                const current = PHASES.findIndex(entry => entry.id === phase);
                                return (
                                    <li key={item.id} className={cn('flex items-center gap-2', index < current ? 'text-emerald-700' : index === current ? 'font-bold text-[#0f1c47]' : 'text-slate-400')}>
                                        {index < current ? <CheckCircle2 className="h-3.5 w-3.5" /> : index === current ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="h-3.5 w-3.5 rounded-full border border-slate-300" />}
                                        {item.label}
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                    <Button type="submit" disabled={busy || accessCode.trim().length < 4} className="h-12 w-full gap-2 rounded-xl bg-[#0f1c47] text-sm font-bold text-white hover:bg-[#182b6b]">
                        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> A ligar à empresa…</> : <><ShieldCheck className="h-4 w-4" /> Validar e Ligar Empresa</>}
                    </Button>
                </form>
            )}
        </div>
    );
}
