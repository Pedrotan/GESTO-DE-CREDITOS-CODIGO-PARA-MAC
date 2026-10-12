import { useState } from 'react';
import { BadgeCheck, CloudUpload, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import Swal from 'sweetalert2';
import { Button } from '@/componentes/ui/button';
import { cn } from '@/bibliotecas/utils';
import { extractLicenseKeysFromText, legacyKeysForImport, type LegacyKeyRecord } from '@/bibliotecas/licencas-legado';

// Licenças no servidor (uma por empresa): lista com dias restantes e fusão das chaves antigas deste Master.

type ServerLicense = {
    id: string;
    keyPrefix: string | null;
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

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

/** Mostra a chave de licença acabada de emitir: o servidor só guarda o hash, por isso não volta a ser mostrada. */
export const mostrarChaveLicenca = async (key: string, companyName: string, replaced: boolean) => {
    const result = await Swal.fire({
        title: 'Chave de licença',
        icon: 'success',
        html: `<div style="text-align:left;font-size:14px;line-height:1.6">
            Chave de licença de <b>${escapeHtml(companyName)}</b>, para activar o Tango ERP nos computadores da empresa:
            <div style="margin:14px 0;padding:14px;border-radius:12px;background:#0f1c47;color:#fff;font:700 18px/1.4 Consolas,monospace;text-align:center;letter-spacing:1px">${escapeHtml(key)}</div>
            <b>Guarde-a agora:</b> por segurança, o servidor só guarda uma impressão digital da chave e não a volta a mostrar.
            ${replaced ? '<br><br>A chave anterior deixou de funcionar para novas activações. Os computadores já activados continuam a funcionar.' : ''}
        </div>`,
        showCancelButton: true,
        confirmButtonText: 'Copiar chave',
        cancelButtonText: 'Fechar',
        confirmButtonColor: '#F37021',
    });
    if (result.isConfirmed) {
        try { await navigator.clipboard.writeText(key); } catch { /* sem acesso à área de transferência */ }
    }
};

export function PainelLicencasServidor({ api, notify }: {
    api: (action: string, payload?: Record<string, any>) => Promise<any>;
    notify: (type: 'success' | 'error', message: string) => void;
}) {
    const [licenses, setLicenses] = useState<ServerLicense[] | null>(null);
    const [busy, setBusy] = useState<'list' | 'import' | string | null>(null);

    const issueKey = async (license: ServerLicense) => {
        if (license.keyPrefix) {
            const confirmation = await Swal.fire({
                title: 'Emitir uma chave nova?',
                html: `A chave actual (<b>${escapeHtml(license.keyPrefix)}-…</b>) de <b>${escapeHtml(license.companyName)}</b> deixa de servir para activar computadores novos. ` +
                    'Os computadores já activados continuam a funcionar.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Emitir chave nova',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#F37021',
            });
            if (!confirmation.isConfirmed) return;
        }
        setBusy(license.id);
        try {
            const data = await api('license-issue-key', { tenantId: license.tenantId });
            setLicenses(previous => previous?.map(item => item.id === license.id ? { ...item, keyPrefix: data.keyPrefix } : item) || previous);
            await mostrarChaveLicenca(data.licenseKey, license.companyName, Boolean(data.replaced));
        } catch (error: any) {
            notify('error', error?.message || 'Não foi possível emitir a chave de licença.');
        } finally {
            setBusy(null);
        }
    };

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
        const local = await legacyKeysForImport(Array.isArray(records) ? records : []);
        // Chaves que não estão na lista deste Master (reinstalação limpa, outro computador): coladas pelo administrador.
        const confirmation = await Swal.fire({
            title: 'Juntar as licenças no servidor',
            html: `<div style="text-align:left;font-size:13px;line-height:1.6">
                ${local.keys.length
                    ? `Este Tango Master tem <b>${local.keys.length}</b> chave(s) emitida(s) na sua lista.`
                    : 'A lista de chaves deste Tango Master está vazia (por exemplo, depois de uma instalação limpa).'}
                Pode colar abaixo outras chaves de licença (começam por <b>eyJ</b>): do certificado PDF, das Definições do Tango ERP
                ou de um e-mail. Pode colar várias de uma vez.<br><br>
                Em cada empresa fica <b>uma</b> licença: a chave com o prazo mais longo define o plano, as máquinas e a data de fim;
                as outras chaves da mesma empresa ficam revogadas. Só os dados da licença são enviados, nunca a chave.
            </div>`,
            input: 'textarea',
            inputPlaceholder: 'Cole aqui as chaves de licença (opcional se a lista deste Master tiver chaves)',
            inputAttributes: { 'aria-label': 'Chaves de licença', spellcheck: 'false' },
            icon: 'question',
            width: 640,
            showCancelButton: true,
            confirmButtonText: 'Juntar licenças',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#F37021',
            preConfirm: (text: string) => {
                if (!local.keys.length && !extractLicenseKeysFromText(text).length) {
                    Swal.showValidationMessage(String(text || '').trim()
                        ? 'Não foi encontrada nenhuma chave de licença completa no texto colado.'
                        : 'Cole pelo menos uma chave de licença.');
                    return false;
                }
                return text;
            },
        });
        if (!confirmation.isConfirmed) return;
        const pasted = await legacyKeysForImport(extractLicenseKeysFromText(String(confirmation.value || '')).map(key => ({ key })));
        const seen = new Set(local.keys.map(key => key.jti));
        const keys = [...local.keys, ...pasted.keys.filter(key => !seen.has(key.jti))];
        const unreadable = local.unreadable + pasted.unreadable;
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
                    <table className="w-full min-w-[880px] text-left text-xs">
                        <thead className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            <tr className="border-b border-slate-100 dark:border-slate-800">
                                <th className="py-2 pr-3">Empresa</th>
                                <th className="py-2 pr-3">Plano</th>
                                <th className="py-2 pr-3">Estado</th>
                                <th className="py-2 pr-3">Fim</th>
                                <th className="py-2 pr-3">Dias restantes</th>
                                <th className="py-2 pr-3">Máquinas</th>
                                <th className="py-2 pr-3">Último contacto</th>
                                <th className="py-2">Chave</th>
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
                                    <td className="py-2.5 pr-3 text-slate-500">{formatDate(license.lastContactAt)}</td>
                                    <td className="py-2.5">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-[10px] text-slate-500">{license.keyPrefix ? `${license.keyPrefix}-…` : 'Sem chave'}</span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => issueKey(license)}
                                                disabled={busy !== null || license.status === 'revogada'}
                                                className="h-7 gap-1 rounded-lg px-2 text-[10px] font-bold"
                                            >
                                                {busy === license.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                                                {license.keyPrefix ? 'Nova chave' : 'Emitir chave'}
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
