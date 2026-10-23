import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Plus, Search } from 'lucide-react';
import { ServicoRH, type Contrato, type Funcionario } from '@/servicos/rh/ServicoRH';
import { ServicoTempoRH } from '@/servicos/rh/ServicoTempoRH';
import { estadoBI } from '@/bibliotecas/rh/bi-validade';
import { valorNumerico } from '@/bibliotecas/rh/parametros-rh';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { NavegacaoRH, SeloBI, dataPt, kz, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import { FormularioFuncionario } from '@/componentes/rh/FormularioFuncionario';
import { FichaFuncionario } from '@/componentes/rh/FichaFuncionario';

const TODOS = '__todos__';

/** Dados de base partilhados pelas páginas de RH. */
export function useBaseRH() {
    return useCarregar(async () => {
        const [funcionarios, departamentos, cargos, rubricas, parametros, contratos] = await Promise.all([
            ServicoRH.funcionarios(), ServicoRH.departamentos(), ServicoRH.cargos(), ServicoRH.rubricas(), ServicoRH.parametros(), ServicoRH.contratos(),
        ]);
        return { funcionarios, departamentos, cargos, rubricas, parametros, contratos };
    }, { funcionarios: [], departamentos: [], cargos: [], rubricas: [], parametros: [], contratos: [] as Contrato[] } as {
        funcionarios: Funcionario[]; departamentos: Awaited<ReturnType<typeof ServicoRH.departamentos>>; cargos: Awaited<ReturnType<typeof ServicoRH.cargos>>;
        rubricas: Awaited<ReturnType<typeof ServicoRH.rubricas>>; parametros: Awaited<ReturnType<typeof ServicoRH.parametros>>; contratos: Contrato[];
    });
}

export default function FuncionariosRH() {
    const { actor, gerir, salarios, confidencial } = useActorRH();
    const base = useBaseRH();
    const { funcionarios, departamentos, cargos, rubricas, parametros, contratos } = base.dados;
    const [pesquisa, setPesquisa] = useState('');
    const [estado, setEstado] = useState<string>('activo');
    const [departamento, setDepartamento] = useState<string>(TODOS);
    const [formulario, setFormulario] = useState<{ aberto: boolean; funcionario: Funcionario | null }>({ aberto: false, funcionario: null });
    const [parametrosUrl] = useSearchParams();
    const [fichaId, setFichaId] = useState<string | null>(parametrosUrl.get('ficha'));
    // Os alertas abrem a ficha do funcionário pelo endereço (?ficha=…).
    useEffect(() => { const id = parametrosUrl.get('ficha'); if (id) setFichaId(id); }, [parametrosUrl]);
    const hoje = luandaTodayKey();
    const anosBI = valorNumerico(parametros, 'bi_anos_validade', hoje, 10);
    const maxMb = valorNumerico(parametros, 'documento_max_mb', hoje, 2);

    const salarioActual = useMemo(() => new Map(contratos.filter(c => c.estado === 'activo').map(c => [c.funcionario_id, c.salario_base_minor])), [contratos]);
    const lista = useMemo(() => {
        const termo = pesquisa.trim().toLowerCase();
        return funcionarios.filter(f => (estado === TODOS || f.estado === estado) && (departamento === TODOS || f.departamento_id === departamento) &&
            (!termo || [f.nome, f.numero_mecanografico, f.nif, f.bi_numero, f.telefone].some(v => v?.toLowerCase().includes(termo))));
    }, [funcionarios, pesquisa, estado, departamento]);
    const ficha = funcionarios.find(f => f.id === fichaId) || null;
    const horarios = useCarregar(() => ServicoTempoRH.horarios(), [] as Awaited<ReturnType<typeof ServicoTempoRH.horarios>>);

    return (
        <MainLayout title="Funcionários" subtitle="Cadastro, contratos, histórico salarial e arquivo digital">
            <NavegacaoRH />
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input className="pl-9" placeholder="Pesquisar por nome, n.º, NIF, BI ou telefone" value={pesquisa} onChange={e => setPesquisa(e.target.value)} />
                </div>
                <Select value={estado} onValueChange={setEstado}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value={TODOS}>Todos os estados</SelectItem><SelectItem value="activo">Activos</SelectItem><SelectItem value="suspenso">Suspensos</SelectItem><SelectItem value="cessado">Cessados</SelectItem></SelectContent>
                </Select>
                <Select value={departamento} onValueChange={setDepartamento}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value={TODOS}>Todos os departamentos</SelectItem>{departamentos.map(d => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}</SelectContent>
                </Select>
                {gerir && <Button onClick={() => setFormulario({ aberto: true, funcionario: null })}><Plus className="mr-1.5 h-4 w-4" /> Novo funcionário</Button>}
            </div>

            {base.aCarregar && funcionarios.length === 0 ? <Vazio>A carregar…</Vazio> : lista.length === 0 ? (
                <Vazio>{funcionarios.length === 0 ? 'Ainda não há funcionários registados.' : 'Nenhum funcionário corresponde aos filtros.'}</Vazio>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500 dark:bg-slate-950">
                            <tr>
                                <th className="px-3 py-2.5">N.º</th><th className="px-3 py-2.5">Nome</th><th className="px-3 py-2.5">Cargo</th><th className="px-3 py-2.5">Departamento</th>
                                <th className="px-3 py-2.5">Admissão</th>{salarios && <th className="px-3 py-2.5 text-right">Salário base</th>}<th className="px-3 py-2.5">BI</th><th className="px-3 py-2.5">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lista.map(f => (
                                <tr key={f.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50" onClick={() => setFichaId(f.id)}>
                                    <td className="px-3 py-2.5 font-mono text-xs">{f.numero_mecanografico}</td>
                                    <td className="px-3 py-2.5 font-semibold">{f.nome}<div className="text-[11px] font-normal text-slate-400">{f.telefone || f.email || ''}</div></td>
                                    <td className="px-3 py-2.5">{cargos.find(c => c.id === f.cargo_id)?.nome || '—'}</td>
                                    <td className="px-3 py-2.5">{departamentos.find(d => d.id === f.departamento_id)?.nome || '—'}</td>
                                    <td className="px-3 py-2.5">{dataPt(f.data_admissao)}</td>
                                    {salarios && <td className="px-3 py-2.5 text-right">{salarioActual.has(f.id) ? kz(salarioActual.get(f.id)) : '—'}</td>}
                                    <td className="px-3 py-2.5"><SeloBI situacao={estadoBI(f.bi_validade, hoje, 30)} /></td>
                                    <td className="px-3 py-2.5 capitalize">{f.estado}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="mt-2 text-xs text-slate-500">{lista.length} de {funcionarios.length} funcionário(s).</p>

            {actor && (
                <FormularioFuncionario open={formulario.aberto} funcionario={formulario.funcionario} actor={actor} departamentos={departamentos} cargos={cargos}
                    anosValidadeBI={anosBI} horarios={horarios.dados} onClose={() => setFormulario({ aberto: false, funcionario: null })} onSaved={() => void base.recarregar()} />
            )}
            {ficha && (
                <FichaFuncionario funcionario={ficha} departamentos={departamentos} cargos={cargos} rubricas={rubricas} funcionarios={funcionarios} actor={actor}
                    permissoes={{ gerir, salarios, confidencial }} maxMb={maxMb} onClose={() => setFichaId(null)}
                    onEditar={() => { setFormulario({ aberto: true, funcionario: ficha }); }} onChange={() => void base.recarregar()} />
            )}
        </MainLayout>
    );
}
