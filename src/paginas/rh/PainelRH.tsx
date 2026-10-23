import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Bell, Cake, CalendarClock, Check, FileWarning, Hourglass, Plane, Receipt } from 'lucide-react';
import { ServicoAlertasRH, type AlertaRH } from '@/servicos/rh/ServicoAlertasRH';
import { ServicoTempoRH } from '@/servicos/rh/ServicoTempoRH';
import { ServicoFeriasRH, type PlanoFeriasRH } from '@/servicos/rh/ServicoFeriasRH';
import { estadoEfectivo } from '@/bibliotecas/rh/ferias';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { Indicador, NavegacaoRH, kz, useCarregar } from '@/componentes/rh/comum-rh';
import { BannerAniversarios } from '@/componentes/rh/BannerAniversarios';
import { EVENTO_ALERTAS_RH } from '@/componentes/rh/TarefaDiariaRH';
import { useBaseRH } from './FuncionariosRH';

/** Próximo aniversário (aaaa-mm-dd) a partir de hoje; 29/02 conta a 28/02 nos anos não bissextos. */
export function proximoAniversario(nascimento: string, hoje: string) {
    const [, m, d] = nascimento.split('-').map(Number);
    for (const ano of [Number(hoje.slice(0, 4)), Number(hoje.slice(0, 4)) + 1]) {
        const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
        const dia = m === 2 && d === 29 && !bissexto ? 28 : d;
        const chave = `${ano}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        if (chave >= hoje) return chave;
    }
    return '';
}

const ICONES: Record<string, typeof Bell> = { aniversario: Cake, aniversario_proximo: Cake, ferias: Plane, regresso: Plane, contrato: Hourglass, experiencia: Hourglass, documento: FileWarning, natal: Receipt, prazos: CalendarClock, faltas_pendentes: Bell };
// Alertas de acção só ficam resolvidos quando a acção é feita; os informativos podem ser arquivados à mão.
const INFORMATIVOS = new Set(['aniversario', 'aniversario_proximo', 'regresso']);
const ROTULO_ACCAO: Record<string, string> = { ferias: 'Processar subsídio', contrato: 'Renovar contrato', experiencia: 'Ver contrato', documento: 'Carregar documento', natal: 'Processar subsídio de Natal', prazos: 'Ver processamento', faltas_pendentes: 'Ver faltas' };

export default function PainelRH() {
    const { actor, salarios } = useActorRH();
    const navigate = useNavigate();
    const base = useBaseRH();
    const alertas = useCarregar(() => ServicoAlertasRH.abertos(), [] as AlertaRH[]);
    const extra = useCarregar(async () => ({ ausencias: await ServicoTempoRH.ausencias(), planos: await ServicoFeriasRH.planos() }), { ausencias: [] as Awaited<ReturnType<typeof ServicoTempoRH.ausencias>>, planos: [] as PlanoFeriasRH[] });
    useEffect(() => {
        const recarregar = () => void alertas.recarregar();
        window.addEventListener(EVENTO_ALERTAS_RH, recarregar);
        return () => window.removeEventListener(EVENTO_ALERTAS_RH, recarregar);
    }, [alertas.recarregar]);
    const { funcionarios, contratos, departamentos } = base.dados;
    const hoje = luandaTodayKey();
    const mes = hoje.slice(0, 7);

    const activos = funcionarios.filter(f => f.estado === 'activo');
    const massaSalarial = contratos.filter(c => c.estado === 'activo' && activos.some(f => f.id === c.funcionario_id)).reduce((s, c) => s + c.salario_base_minor, 0);
    const deFerias = extra.dados.planos.filter(p => estadoEfectivo(p, hoje) === 'em_gozo').length;
    const faltasMes = extra.dados.ausencias.filter(a => a.estado === 'aprovada' && a.tipo_id === 'ausencia-F' && a.data_inicio.startsWith(mes)).reduce((s, a) => s + a.dias, 0);
    const lista = alertas.dados.filter(a => a.destinatario_perfil !== 'clientes' && a.tipo !== 'aniversario');
    const porDepartamento = departamentos.map(d => ({ nome: d.nome, total: activos.filter(f => f.departamento_id === d.id).length })).filter(d => d.total > 0);

    const accao = (a: AlertaRH) => {
        if (actor && a.estado === 'novo') void ServicoAlertasRH.marcarLido(a.id, actor);
        if (a.accao) navigate(a.accao);
    };

    return (
        <MainLayout title="Painel de RH" subtitle="Efectivos, custos, alertas e lembretes do dia">
            <NavegacaoRH />
            <BannerAniversarios />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Indicador titulo="Funcionários activos" valor={activos.length} nota={`${funcionarios.filter(f => f.estado === 'suspenso').length} suspenso(s)`} tom="emerald" />
                <Indicador titulo="De férias hoje" valor={deFerias} tom="sky" />
                <Indicador titulo="Faltas injustificadas no mês" valor={faltasMes} tom={faltasMes ? 'red' : 'slate'} />
                <Indicador titulo="Massa salarial (base)" valor={salarios ? kz(massaSalarial) : '•••'} nota="Soma dos salários base dos contratos activos" />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
                    <h2 className="mb-3 flex items-center gap-2 font-black"><Bell className="h-4 w-4" /> Alertas e lembretes <span className="rounded-full bg-orange-100 px-2 text-xs text-orange-700">{lista.filter(a => a.estado === 'novo').length} novo(s)</span></h2>
                    {lista.length === 0 ? <p className="text-sm text-slate-500">Sem alertas abertos.</p> : (
                        <ul className="space-y-2">
                            {lista.map(a => {
                                const Icone = ICONES[a.tipo] || Bell;
                                return (
                                    <li key={a.id} className={`flex items-start gap-3 rounded-xl px-3 py-2 text-sm ${a.estado === 'novo' ? 'bg-orange-50 dark:bg-orange-950/30' : 'bg-slate-50 dark:bg-slate-800/60'}`}>
                                        <Icone className={`mt-0.5 h-4 w-4 shrink-0 ${a.prioridade === 1 ? 'text-red-500' : a.prioridade === 2 ? 'text-orange-500' : 'text-sky-500'}`} />
                                        <span className="flex-1">{a.mensagem}</span>
                                        <span className="flex shrink-0 gap-1">
                                            {a.accao && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => accao(a)}>{ROTULO_ACCAO[a.tipo] || 'Abrir'}</Button>}
                                            {actor && INFORMATIVOS.has(a.tipo) && <Button size="icon" variant="ghost" className="h-7 w-7" title="Arquivar" onClick={() => void ServicoAlertasRH.resolver(a.id, actor).then(() => alertas.recarregar())}><Check className="h-4 w-4" /></Button>}
                                            {actor && !INFORMATIVOS.has(a.tipo) && a.estado === 'novo' && <Button size="icon" variant="ghost" className="h-7 w-7" title="Marcar como lido" onClick={() => void ServicoAlertasRH.marcarLido(a.id, actor).then(() => alertas.recarregar())}><Check className="h-4 w-4" /></Button>}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
                <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="mb-3 font-black">Por departamento</h2>
                    {porDepartamento.length === 0 ? <p className="text-sm text-slate-500">Sem departamentos com funcionários. <Link className="font-bold text-sky-600" to="/rh/configuracoes">Configurar</Link></p> : (
                        <ul className="space-y-1.5 text-sm">
                            {porDepartamento.map(d => (
                                <li key={d.nome} className="flex items-center gap-2">
                                    <span className="w-32 truncate">{d.nome}</span>
                                    <span className="h-2 rounded-full bg-sky-500" style={{ width: `${Math.max(6, (d.total / Math.max(1, activos.length)) * 100)}%` }} />
                                    <span className="font-bold">{d.total}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </MainLayout>
    );
}
