import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Cake, FileWarning, Hourglass, IdCard } from 'lucide-react';
import { ServicoRH, type DocumentoRH } from '@/servicos/rh/ServicoRH';
import { estadoBI } from '@/bibliotecas/rh/bi-validade';
import { addDaysToKey, luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { Indicador, NavegacaoRH, dataPt, kz, useCarregar } from '@/componentes/rh/comum-rh';
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

type Lembrete = { data: string; texto: string; tipo: 'aniversario' | 'contrato' | 'experiencia' | 'documento' | 'bi' };
const ICONES = { aniversario: Cake, contrato: Hourglass, experiencia: Hourglass, documento: FileWarning, bi: IdCard };

export default function PainelRH() {
    const { salarios } = useActorRH();
    const base = useBaseRH();
    const documentos = useCarregar(() => ServicoRH.documentos(), [] as DocumentoRH[]);
    const { funcionarios, contratos, departamentos } = base.dados;
    const hoje = luandaTodayKey();

    const activos = funcionarios.filter(f => f.estado === 'activo');
    const contratosActivos = contratos.filter(c => c.estado === 'activo' && activos.some(f => f.id === c.funcionario_id));
    const massaSalarial = contratosActivos.reduce((s, c) => s + c.salario_base_minor, 0);

    const lembretes = useMemo(() => {
        const lista: Lembrete[] = [];
        const nome = (id: string) => funcionarios.find(f => f.id === id)?.nome || '—';
        for (const f of activos) {
            if (f.data_nascimento) {
                const proximo = proximoAniversario(f.data_nascimento, hoje);
                if (proximo && proximo <= addDaysToKey(hoje, 7)) lista.push({ data: proximo, tipo: 'aniversario', texto: proximo === hoje ? `Hoje é o aniversário de ${f.nome}. Feliz aniversário!` : `O aniversário de ${f.nome} é a ${dataPt(proximo)}.` });
            }
            const bi = estadoBI(f.bi_validade, hoje, 30);
            if (bi.estado === 'expirado' || bi.estado === 'a_expirar') lista.push({ data: f.bi_validade!, tipo: 'bi', texto: `O BI de ${f.nome} ${bi.estado === 'expirado' ? 'expirou' : 'expira'} a ${dataPt(f.bi_validade)}.` });
        }
        for (const c of contratosActivos) {
            if (c.fim && c.fim <= addDaysToKey(hoje, 60)) lista.push({ data: c.fim, tipo: 'contrato', texto: `O contrato de ${nome(c.funcionario_id)} termina a ${dataPt(c.fim)}.` });
            if (c.periodo_experiencia_fim && c.periodo_experiencia_fim >= hoje && c.periodo_experiencia_fim <= addDaysToKey(hoje, 15))
                lista.push({ data: c.periodo_experiencia_fim, tipo: 'experiencia', texto: `O período experimental de ${nome(c.funcionario_id)} termina a ${dataPt(c.periodo_experiencia_fim)}.` });
        }
        for (const d of documentos.dados) {
            if (d.estado === 'activo' && d.data_validade && d.data_validade <= addDaysToKey(hoje, 30) && d.categoria !== 'identificacao')
                lista.push({ data: d.data_validade, tipo: 'documento', texto: `O documento «${d.nome}» de ${nome(d.funcionario_id)} ${d.data_validade < hoje ? 'expirou' : 'expira'} a ${dataPt(d.data_validade)}.` });
        }
        return lista.sort((a, b) => a.data.localeCompare(b.data));
    }, [activos, contratosActivos, documentos.dados, funcionarios, hoje]);

    const porDepartamento = departamentos.map(d => ({ nome: d.nome, total: activos.filter(f => f.departamento_id === d.id).length })).filter(d => d.total > 0);

    return (
        <MainLayout title="Painel de RH" subtitle="Efectivos, custos e lembretes do dia">
            <NavegacaoRH />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Indicador titulo="Funcionários activos" valor={activos.length} nota={`${funcionarios.filter(f => f.estado === 'suspenso').length} suspenso(s)`} tom="emerald" />
                <Indicador titulo="Admissões este ano" valor={funcionarios.filter(f => f.data_admissao?.startsWith(hoje.slice(0, 4))).length}
                    nota={`${funcionarios.filter(f => f.data_saida?.startsWith(hoje.slice(0, 4))).length} saída(s)`} tom="sky" />
                <Indicador titulo="Massa salarial (base)" valor={salarios ? kz(massaSalarial) : '•••'} nota="Soma dos salários base dos contratos activos" />
                <Indicador titulo="Lembretes" valor={lembretes.length} nota="Próximos 7 a 60 dias" tom={lembretes.length ? 'orange' : 'slate'} />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
                    <h2 className="mb-3 font-black">Lembretes</h2>
                    {lembretes.length === 0 ? <p className="text-sm text-slate-500">Sem lembretes.</p> : (
                        <ul className="space-y-2">
                            {lembretes.map((l, i) => {
                                const Icone = ICONES[l.tipo];
                                return (
                                    <li key={i} className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
                                        <Icone className={`mt-0.5 h-4 w-4 shrink-0 ${l.tipo === 'aniversario' ? 'text-pink-500' : l.data < hoje ? 'text-red-500' : 'text-orange-500'}`} />
                                        <span>{l.texto}</span>
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
