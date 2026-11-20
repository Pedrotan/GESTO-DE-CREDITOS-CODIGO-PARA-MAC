import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { ServicoSalariosRH, type LinhaReciboRH } from '@/servicos/rh/ServicoSalariosRH';
import type { ServicoPortalRH } from '@/servicos/rh/ServicoPortalRH';
import { periodoPt } from '@/bibliotecas/rh/pdf-rh';
import { kz, useCarregar, Vazio } from './comum-rh';

type ReciboPortal = Awaited<ReturnType<typeof ServicoPortalRH.meusRecibos>>[number];
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/**
 * Painel do funcionário: INSS, IRT e subsídios das folhas finais (aprovadas), por ano e mês, e os abonos do último
 * recibo. Só valores oficiais (a folha de correcção ainda pode mudar).
 */
export function ResumoDescontosFuncionario({ finais }: { finais: ReciboPortal[] }) {
    const anos = useMemo(() => [...new Set(finais.map(r => r.ano))].sort((a, b) => b - a), [finais]);
    const [ano, setAno] = useState<number | null>(null);
    const anoSel = ano ?? anos[0] ?? new Date().getFullYear();
    const doAno = finais.filter(r => r.ano === anoSel).sort((a, b) => a.mes - b.mes || a.tipo.localeCompare(b.tipo));
    const ultimo = finais[0];
    const abonos = useCarregar(() => (ultimo ? ServicoSalariosRH.linhas(ultimo.id) : Promise.resolve([] as LinhaReciboRH[])), [] as LinhaReciboRH[], [ultimo?.id]);
    const soma = (k: 'bruto_minor' | 'inss_minor' | 'irt_minor' | 'liquido_minor' | 'total_abonos_minor') => doAno.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const i = anos.indexOf(anoSel);

    return (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-black">INSS, IRT e subsídios</h2>
                {anos.length > 0 && (
                    <div className="flex items-center gap-1 rounded-lg border bg-background p-0.5">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Ano anterior" disabled={i >= anos.length - 1} onClick={() => setAno(anos[i + 1])}><ChevronLeft className="h-4 w-4" /></Button>
                        <span className="min-w-[40px] px-2 text-center text-xs font-bold">{anoSel}</span>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Ano seguinte" disabled={i <= 0} onClick={() => setAno(anos[i - 1])}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                )}
            </div>
            {!doAno.length ? <Vazio>Ainda não há folhas aprovadas{anos.length ? ` em ${anoSel}` : ''}.</Vazio> : (
                <>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {([['Bruto no ano', soma('bruto_minor'), ''], ['INSS (3%) descontado', soma('inss_minor'), 'text-red-600 dark:text-red-400'],
                            ['IRT descontado', soma('irt_minor'), 'text-red-600 dark:text-red-400'], ['Líquido recebido', soma('liquido_minor'), 'text-emerald-700 dark:text-emerald-300']] as const).map(([t, v, cor]) => (
                            <div key={t} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/60">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t}</div>
                                <div className={`text-base font-black tabular-nums ${cor}`}>{kz(v)}</div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-3 overflow-x-auto">
                        <table className="w-full min-w-[520px] text-sm">
                            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                                <th className="py-1.5">Mês</th><th className="py-1.5 text-right">Abonos</th><th className="py-1.5 text-right">INSS</th><th className="py-1.5 text-right">IRT</th><th className="py-1.5 text-right">Líquido</th>
                            </tr></thead>
                            <tbody>
                                {doAno.map(r => (
                                    <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                                        <td className="py-1.5">{MESES[r.mes - 1]}{r.tipo !== 'normal' ? <span className="text-slate-500"> · {r.tipo}</span> : null}</td>
                                        <td className="py-1.5 text-right tabular-nums">{kz(r.total_abonos_minor)}</td>
                                        <td className="py-1.5 text-right tabular-nums text-red-600 dark:text-red-400">{kz(r.inss_minor)}</td>
                                        <td className="py-1.5 text-right tabular-nums text-red-600 dark:text-red-400">{kz(r.irt_minor)}</td>
                                        <td className="py-1.5 text-right font-bold tabular-nums">{kz(r.liquido_minor)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
            {ultimo && abonos.dados.some(l => l.tipo === 'abono' && l.codigo !== 'SAL_BASE') && (
                <div className="mt-4">
                    <h3 className="mb-1.5 text-sm font-black text-slate-600 dark:text-slate-300">Subsídios e abonos · {periodoPt(ultimo.ano, ultimo.mes)}</h3>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                        {abonos.dados.filter(l => l.tipo === 'abono' && l.codigo !== 'SAL_BASE').map(l => (
                            <div key={l.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-1.5 text-sm dark:border-slate-800">
                                <span>{l.descricao}{!l.incide_irt ? <span className="ml-1 text-[10px] font-bold text-emerald-700">isento de IRT</span> : null}</span>
                                <span className="font-bold tabular-nums">{kz(l.valor_minor)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}
