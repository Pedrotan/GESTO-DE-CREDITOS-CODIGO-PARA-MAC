import { useState } from 'react';
import { BadgeCheck, CloudUpload, Loader2, RefreshCw } from 'lucide-react';
import Swal from 'sweetalert2';
import { Button } from '@/componentes/ui/button';
import { cn } from '@/bibliotecas/utils';
import { legacyKeysForImport, type LegacyKeyRecord } from '@/bibliotecas/licencas-legado';

// Licenças no servidor (uma por empresa): lista com dias restantes e fusão das chaves antigas deste Master.

type ServerLicense = {
    id: string;
    tenantId: string;
    companyName: string;
    plan: string;
    planName: string;
    tier: string;
    status: 'ativa' | 'suspensa' | 'expirada' | 'revogada';
    endsAt: string | null;
    daysRemaining: number | null;
    maxMachines: number;
    machines: number;
    lastContactAt: string | null;
    revokedLegacyKeys: number;
};

type ImportReport = {
    mantidas: number;
    revogadas: number;
    ativacoes: number;
    ignoradas: { jti: string; motivo: string }[];
    empresas: { empresaId: string; dataFimNuvemDiferente: boolean; dataFim: string; dataFimNuvem: string | null }[];
};

const STATUS_LABEL: Record<ServerLicense['status'], string> = { ativa: 'Activa', suspensa: 'Suspensa', expirada: 'Expirada', revogada: 'Revogada' };

/** Verde > 30 dias, amarelo 8 a 30, vermelho 7 ou menos, cinzento para expiradas ou sem efeito. */
const daysTone = (license: ServerLicense) => {
    if (license.status !== 'ativa') return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
    if (license.daysRemaining === null || license.daysRemaining > 30) return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
    if (license.daysRemaining > 7) return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
    return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300';
};

const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString('pt-AO') : '—';

export function PainelLicencasServidor({ api, notify }: {
    api: (action: string, payload?: Record<string, any>) => Promise<any>;
    notify: (type: 'success' | 'error', message: string) => void;
}) {
    const [licenses, setLicenses] = useState<ServerLicense[] | null>(null);
    const [busy, setBusy] = useState<'list' | 'import' | null>(null);

    const load = async () => {
        setBusy('list');
        try {
            const data = await api('licenses-list');
            setLicenses(data.licenses || []);
        } catch (error: any) {
            notify('error', error?.message || 'Não foi possível obter as licenças do servidor.');
        } finally {
            setBusy(null);
        }
    };

    const importLegacy = async () => {
        let records: LegacyKeyRecord[] = [];
        try { records = JSON.parse(localStorage.getItem('tango_master_keys') || '[]'); } catch { records = []; }
        const { keys, unreadable } = await legacyKeysForImport(Array.isArray(records) ? records : []);
        if (!keys.length) {
            notify('error', 'Este Tango Master não tem chaves de licença emitidas para enviar ao servidor.');
            return;
        }
        const confirmation = await Swal.fire({
            title: 'Juntar as licenças no servidor?',
            html: `Vão ser enviadas <b>${keys.length}</b> chave(s) emitidas neste computador (só os dados da licença, nunca a chave).<br><br>` +
                'Em cada empresa fica <b>uma</b> licença: a chave com o prazo mais longo define o plano, as máquinas e a data de fim; ' +
                'as outras chaves da mesma empresa ficam revogadas. A data de expiração da nuvem não é alterada.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Juntar licenças',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#F37021',
        });
        if (!confirmation.isConfirmed) return;
        setBusy('import');
        try {
            const data = await api('licenses-import-legacy', { keys });
            const report: ImportReport = data.report;
            setLicenses(data.licenses || []);
            const differences = report.empresas.filter(item => item.dataFimNuvemDiferente);
            const skipped = report.ignoradas.length + unreadable;
            await Swal.fire({
                title: 'Licenças juntas',
                icon: 'success',
                confirmButtonColor: '#F37021',
                html: `<div style="text-align:left;font-size:14px;line-height:1.6">
                    Empresas com licença única: <b>${report.empresas.length}</b><br>
                    Chaves mantidas: <b>${report.mantidas}</b> · revogadas: <b>${report.revogadas}</b><br>
                    Máquinas registadas: <b>${report.ativacoes}</b><br>
                    ${skipped ? `Não importadas: <b>${skipped}</b> (sem NIF de empresa, empresa não registada na nuvem ou formato antigo)<br>` : ''}
                    ${differences.length ? `<br><b>Atenção:</b> em ${differences.length} empresa(s) a data de fim da chave é diferente da data de expiração da nuvem. ` +
                        'Confirme a data certa e renove a empresa na lista acima.' : ''}
                </div>`,
            });
        } catch (error: any) {
            notify('error', error?.message || 'Não foi possível juntar as licenças no servidor.');
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                    <h3 className="flex items-center gap-2 text-lg font-black text-slate-900 dark:text-white">
                        <BadgeCheck className="h-5 w-5 text-[#F37021]" /> Licenças no servidor
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Uma licença por empresa, válida para o Desktop e a versão web. Os dias restantes são calculados no servidor.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={load} disabled={busy !== null} className="h-10 gap-2 rounded-xl text-xs font-bold">
                        {busy === 'list' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        {licenses ? 'Actualizar' : 'Ver licenças'}
                    </Button>
                    <Button onClick={importLegacy} disabled={busy !== null} className="h-10 gap-2 rounded-xl bg-[#F37021] text-xs font-bold text-white hover:bg-orange-600">
                        {busy === 'import' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
                        Juntar chaves antigas
                    </Button>
                </div>
            </div>

            {licenses && !licenses.length && (
                <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-700">
                    Ainda não existem empresas registadas neste servidor.
                </p>
            )}

            {licenses && licenses.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-xs">
                        <thead className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            <tr className="border-b border-slate-100 dark:border-slate-800">
                                <th className="py-2 pr-3">Empresa</th>
                                <th className="py-2 pr-3">Plano</th>
                                <th className="py-2 pr-3">Estado</th>
                                <th className="py-2 pr-3">Fim</th>
                                <th className="py-2 pr-3">Dias restantes</th>
                                <th className="py-2 pr-3">Máquinas</th>
                                <th className="py-2">Último contacto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {licenses.map(license => (
                                <tr key={license.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                                    <td className="py-2.5 pr-3">
                                        <p className="font-bold text-slate-800 dark:text-slate-100">{license.companyName}</p>
                                        <p className="font-mono text-[10px] text-slate-400">{license.tenantId}</p>
                                    </td>
                                    <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                                        {license.planName}
                                        {license.revokedLegacyKeys > 0 && (
                                            <span className="block text-[10px] text-slate-400">{license.revokedLegacyKeys} chave(s) antiga(s) revogada(s)</span>
                                        )}
                                    </td>
                                    <td className="py-2.5 pr-3 font-semibold text-slate-700 dark:text-slate-200">{STATUS_LABEL[license.status]}</td>
                                    <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{license.endsAt ? formatDate(license.endsAt) : 'Sem data'}</td>
                                    <td className="py-2.5 pr-3">
                                        <span className={cn('rounded-md px-2 py-0.5 font-bold', daysTone(license))}>
                                            {license.status === 'ativa' ? (license.daysRemaining === null ? 'Sem limite' : `${license.daysRemaining} dias`) : STATUS_LABEL[license.status]}
                                        </span>
                                    </td>
                                    <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{license.machines} / {license.maxMachines}</td>
                                    <td className="py-2.5 text-slate-500">{formatDate(license.lastContactAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
