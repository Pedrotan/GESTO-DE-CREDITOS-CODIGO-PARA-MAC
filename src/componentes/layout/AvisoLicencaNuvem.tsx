import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Loader2, LockKeyhole, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { CLOUD_LICENSE_EVENT, getCloudLicenseStatus, isCloudLicenseReadOnly, refreshCloudLicense, type CloudLicenseStatus } from '@/bibliotecas/licenca-nuvem-cliente';

/**
 * Faixa no topo do Tango ERP quando a licença da empresa (chave TANGO-…) precisa de atenção: modo só leitura
 * (mais de 7 dias sem validar, licença terminada), relógio atrasado, ou recusa do servidor ainda dentro dos 7 dias.
 */
export function AvisoLicencaNuvem() {
    const [status, setStatus] = useState<CloudLicenseStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState('');

    useEffect(() => {
        let cancelled = false;
        void getCloudLicenseStatus(0).then(value => { if (!cancelled) setStatus(value); });
        const onChange = (event: Event) => setStatus((event as CustomEvent<CloudLicenseStatus>).detail);
        window.addEventListener(CLOUD_LICENSE_EVENT, onChange);
        return () => { cancelled = true; window.removeEventListener(CLOUD_LICENSE_EVENT, onChange); };
    }, []);

    // Só no Desktop: na versão web, o bloqueio por licença é o ecrã de subscrição (GuardaSubscricaoWeb).
    if (!status || status.state === 'none' || !(window as any).electronAPI) return null;
    const readOnly = isCloudLicenseReadOnly(status);
    const refusal = !readOnly && status.refusal ? status.refusal : null;
    if (!readOnly && !refusal) return null;

    const validateNow = async () => {
        setBusy(true);
        setFeedback('');
        try {
            const next = await refreshCloudLicense();
            setStatus(next);
            if (isCloudLicenseReadOnly(next)) setFeedback(next.state === 'clock' ? 'O relógio continua atrasado.' : 'Ainda não foi possível validar a licença.');
        } catch {
            setFeedback('Sem ligação ao servidor de licenças.');
        } finally {
            setBusy(false);
        }
    };

    const validUntil = status.licenca?.validoAte ? new Date(status.licenca.validoAte).toLocaleDateString('pt-AO') : null;
    const Icon = status.state === 'clock' ? Clock : readOnly ? LockKeyhole : TriangleAlert;
    return (
        <div role="alert" className={readOnly
            ? 'flex flex-wrap items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200'
            : 'flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'}>
            <Icon className="h-4 w-4 shrink-0" />
            <p className="min-w-0 flex-1">
                <strong className="font-bold">{readOnly ? 'Modo só de leitura. ' : 'Licença: '}</strong>
                {readOnly
                    ? status.message
                    : `${refusal!.message} Este computador continua a funcionar até ${validUntil || 'o fim da validação actual'}.`}
                {feedback && <span className="ml-1 font-semibold">{feedback}</span>}
            </p>
            <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={validateNow} disabled={busy} className="h-8 gap-1.5 bg-white/70 text-xs dark:bg-transparent">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Validar agora
                </Button>
                <Button size="sm" variant="outline" asChild className="h-8 bg-white/70 text-xs dark:bg-transparent">
                    <Link to="/definicoes">Chave de licença</Link>
                </Button>
            </div>
        </div>
    );
}
