// Diálogos das acções sobre funcionários, partilhados pela lista (coluna Acções e acções em massa) e pela ficha.
import { useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { ServicoRH, type ActorRH, type Contrato, type Departamento, type Rubrica } from '@/servicos/rh/ServicoRH';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { executar, kz, paraMinor } from './comum-rh';

type Base = { actor: ActorRH; onClose: () => void; onSaved: () => void };

export function Moldura({ titulo, descricao, children, onClose, onConfirm, aGuardar, rotulo = 'Guardar', perigo }: {
    titulo: string; descricao?: string; children: ReactNode; onClose: () => void; onConfirm: () => void; aGuardar: boolean; rotulo?: string; perigo?: boolean;
}) {
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>{titulo}</DialogTitle>{descricao && <DialogDescription>{descricao}</DialogDescription>}</DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">{children}</div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button disabled={aGuardar} onClick={onConfirm} className={perigo ? 'bg-rh-danger hover:bg-red-800' : undefined}>{aGuardar ? 'A guardar…' : rotulo}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export const CampoDialogo = ({ label, children, largo }: { label: string; children: ReactNode; largo?: boolean }) =>
    <div className={largo ? 'sm:col-span-2' : ''}><Label className="text-xs font-bold">{label}</Label><div className="mt-1">{children}</div></div>;

function useGuardar(onSaved: () => void, onClose: () => void) {
    const [aGuardar, setAGuardar] = useState(false);
    const guardar = async (accao: () => Promise<unknown>, mensagem: string) => {
        setAGuardar(true);
        const ok = await executar(accao, mensagem);
        setAGuardar(false);
        if (ok) { onSaved(); onClose(); }
    };
    return { aGuardar, guardar };
}

/** Novo contrato, renovação ou alteração salarial: o contrato actual termina e fica no histórico. */
export function DialogoContrato({ funcionarioId, actual, actor, onClose, onSaved, apenasSalario }: Base & { funcionarioId: string; actual?: Contrato; apenasSalario?: boolean }) {
    const [c, setC] = useState({
        tipo: actual?.tipo || 'indeterminado', inicio: luandaTodayKey(), fim: actual?.fim || '', periodo_experiencia_fim: '',
        salario: (actual?.salario_base_minor || 0) / 100, horas_semanais: actual?.horas_semanais || 40, dias_ferias: actual?.dias_ferias || 22,
        motivo: apenasSalario ? 'Actualização salarial' : actual ? 'Renovação de contrato' : 'Admissão',
    });
    const { aGuardar, guardar } = useGuardar(onSaved, onClose);
    return (
        <Moldura titulo={apenasSalario ? 'Registar alteração salarial' : actual ? 'Novo contrato / renovar' : 'Registar contrato'} aGuardar={aGuardar} onClose={onClose}
            descricao={actual ? `Salário actual: ${kz(actual.salario_base_minor)}. O contrato actual termina e fica no histórico, com o valor anterior registado.` : 'O contrato fica activo a partir da data de início.'}
            onConfirm={() => void guardar(() => ServicoRH.novoContrato(funcionarioId, { tipo: c.tipo as Contrato['tipo'], inicio: c.inicio, fim: c.fim || null,
                periodo_experiencia_fim: c.periodo_experiencia_fim || null, salario_base_minor: paraMinor(c.salario), horas_semanais: c.horas_semanais, dias_ferias: c.dias_ferias }, c.motivo, actor),
            apenasSalario ? 'Alteração salarial registada' : 'Contrato registado')}>
            {!apenasSalario && (
                <CampoDialogo label="Tipo">
                    <Select value={c.tipo} onValueChange={v => setC(p => ({ ...p, tipo: v as Contrato['tipo'] }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="indeterminado">Tempo indeterminado</SelectItem><SelectItem value="determinado">Termo certo</SelectItem></SelectContent>
                    </Select>
                </CampoDialogo>
            )}
            <CampoDialogo label="Data de efeito / início"><Input type="date" value={c.inicio} onChange={e => setC(p => ({ ...p, inicio: e.target.value }))} /></CampoDialogo>
            {!apenasSalario && <CampoDialogo label="Fim (termo certo)"><Input type="date" value={c.fim} disabled={c.tipo !== 'determinado'} onChange={e => setC(p => ({ ...p, fim: e.target.value }))} /></CampoDialogo>}
            {!apenasSalario && <CampoDialogo label="Fim do período experimental"><Input type="date" value={c.periodo_experiencia_fim} onChange={e => setC(p => ({ ...p, periodo_experiencia_fim: e.target.value }))} /></CampoDialogo>}
            <CampoDialogo label="Salário base"><CurrencyInput value={c.salario} onValueChange={v => setC(p => ({ ...p, salario: v }))} /></CampoDialogo>
            {!apenasSalario && (
                <CampoDialogo label="Horas semanais / dias de férias">
                    <div className="flex gap-2">
                        <Input type="number" aria-label="Horas semanais" value={c.horas_semanais} onChange={e => setC(p => ({ ...p, horas_semanais: Number(e.target.value) }))} />
                        <Input type="number" aria-label="Dias de férias" value={c.dias_ferias} onChange={e => setC(p => ({ ...p, dias_ferias: Number(e.target.value) }))} />
                    </div>
                </CampoDialogo>
            )}
            <CampoDialogo label="Motivo" largo><Input value={c.motivo} onChange={e => setC(p => ({ ...p, motivo: e.target.value }))} /></CampoDialogo>
        </Moldura>
    );
}

/** Terminar contrato: não apaga o funcionário; passa a «Terminado» com a data e o motivo. */
export function DialogoTerminar({ funcionarioId, nome, actor, onClose, onSaved }: Base & { funcionarioId: string; nome: string }) {
    const [dataSaida, setDataSaida] = useState(luandaTodayKey());
    const [motivo, setMotivo] = useState('');
    const { aGuardar, guardar } = useGuardar(onSaved, onClose);
    return (
        <Moldura titulo={`Terminar contrato — ${nome}`} perigo rotulo="Terminar contrato" aGuardar={aGuardar} onClose={onClose}
            descricao="O funcionário passa a «Terminado» nesta data. A ficha, os contratos, os recibos e os documentos mantêm-se."
            onConfirm={() => void guardar(() => ServicoRH.cessarContrato(funcionarioId, dataSaida, motivo, actor), 'Contrato terminado')}>
            <CampoDialogo label="Data de saída"><Input type="date" value={dataSaida} onChange={e => setDataSaida(e.target.value)} /></CampoDialogo>
            <CampoDialogo label="Motivo"><Input value={motivo} placeholder="Ex.: fim do termo, rescisão" onChange={e => setMotivo(e.target.value)} /></CampoDialogo>
        </Moldura>
    );
}

/** Suspender (com motivo) ou reactivar um funcionário. */
export function DialogoSuspender({ funcionarioId, nome, suspenso, actor, onClose, onSaved }: Base & { funcionarioId: string; nome: string; suspenso: boolean }) {
    const [motivo, setMotivo] = useState('');
    const { aGuardar, guardar } = useGuardar(onSaved, onClose);
    return (
        <Moldura titulo={`${suspenso ? 'Reactivar' : 'Suspender'} — ${nome}`} rotulo={suspenso ? 'Reactivar' : 'Suspender'} aGuardar={aGuardar} onClose={onClose}
            descricao={suspenso ? 'Volta a «Activo» e entra outra vez no processamento salarial.' : 'Um funcionário suspenso não entra no processamento salarial normal até ser reactivado.'}
            onConfirm={() => void guardar(() => ServicoRH.alterarEstado(funcionarioId, suspenso ? 'activo' : 'suspenso', motivo, actor), suspenso ? 'Funcionário reactivado' : 'Funcionário suspenso')}>
            <CampoDialogo label={suspenso ? 'Observação (opcional)' : 'Motivo'} largo><Textarea rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} /></CampoDialogo>
        </Moldura>
    );
}

/** Atribuir um subsídio do catálogo a um ou vários funcionários. */
export function DialogoSubsidio({ funcionarioIds, rubricas, salarioBaseMinor, actor, onClose, onSaved }: Base & { funcionarioIds: string[]; rubricas: Rubrica[]; salarioBaseMinor?: number }) {
    const escolhiveis = rubricas.filter(r => r.activo && !r.sistema && r.tipo === 'abono' && r.periodicidade !== 'pontual');
    const [rubricaId, setRubricaId] = useState(escolhiveis[0]?.id || '');
    const [valor, setValor] = useState(0);
    const [inicio, setInicio] = useState(luandaTodayKey());
    const [fim, setFim] = useState('');
    const r = escolhiveis.find(x => x.id === rubricaId);
    const { aGuardar, guardar } = useGuardar(onSaved, onClose);
    const escolher = (id: string) => { setRubricaId(id); setValor((escolhiveis.find(x => x.id === id)?.valor_padrao_minor || 0) / 100); };
    return (
        <Moldura titulo={funcionarioIds.length > 1 ? `Atribuir subsídio a ${funcionarioIds.length} funcionários` : 'Atribuir subsídio'} rotulo="Atribuir" aGuardar={aGuardar} onClose={onClose}
            descricao="O subsídio entra em todos os processamentos entre o início e o fim."
            onConfirm={() => void guardar(async () => {
                for (const id of funcionarioIds) await ServicoRH.atribuirRubrica(id, { rubrica_id: rubricaId, valor_minor: r?.forma === 'percentagem' ? 0 : paraMinor(valor), inicio, fim: fim || null }, actor);
            }, 'Subsídio atribuído')}>
            <CampoDialogo label="Subsídio" largo>
                <Select value={rubricaId} onValueChange={escolher}>
                    <SelectTrigger><SelectValue placeholder="Escolha do catálogo" /></SelectTrigger>
                    <SelectContent>{escolhiveis.map(x => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}</SelectContent>
                </Select>
            </CampoDialogo>
            {r?.forma === 'percentagem'
                ? <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 sm:col-span-2 dark:bg-slate-800 dark:text-slate-300">
                    {Math.round(r.percentagem * 1000) / 10}% do salário base{salarioBaseMinor ? ` = ${kz(Math.round(salarioBaseMinor * r.percentagem))} por mês` : ''}.
                </div>
                : <CampoDialogo label={r?.por_dia ? 'Valor por dia trabalhado' : 'Valor mensal'}><CurrencyInput value={valor} onValueChange={setValor} /></CampoDialogo>}
            <CampoDialogo label="Início"><Input type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></CampoDialogo>
            <CampoDialogo label="Fim (opcional)"><Input type="date" value={fim} onChange={e => setFim(e.target.value)} /></CampoDialogo>
        </Moldura>
    );
}

export function DialogoDependente({ funcionarioId, actor, onClose, onSaved }: Base & { funcionarioId: string }) {
    const [d, setD] = useState({ nome: '', parentesco: 'Filho(a)', data_nascimento: '' });
    const { aGuardar, guardar } = useGuardar(onSaved, onClose);
    return (
        <Moldura titulo="Adicionar dependente" aGuardar={aGuardar} onClose={onClose}
            onConfirm={() => void guardar(() => ServicoRH.adicionarDependente(funcionarioId, d, actor), 'Dependente adicionado')}>
            <CampoDialogo label="Nome" largo><Input value={d.nome} onChange={e => setD(p => ({ ...p, nome: e.target.value }))} /></CampoDialogo>
            <CampoDialogo label="Parentesco"><Input value={d.parentesco} onChange={e => setD(p => ({ ...p, parentesco: e.target.value }))} /></CampoDialogo>
            <CampoDialogo label="Data de nascimento"><Input type="date" value={d.data_nascimento} onChange={e => setD(p => ({ ...p, data_nascimento: e.target.value }))} /></CampoDialogo>
        </Moldura>
    );
}

/** Mudar o departamento de vários funcionários (acção em massa). */
export function DialogoDepartamento({ funcionarioIds, departamentos, actor, onClose, onSaved }: Base & { funcionarioIds: string[]; departamentos: Departamento[] }) {
    const [dep, setDep] = useState(departamentos.find(d => d.activo)?.id || '');
    const { aGuardar, guardar } = useGuardar(onSaved, onClose);
    return (
        <Moldura titulo={`Alterar departamento de ${funcionarioIds.length} funcionário(s)`} aGuardar={aGuardar} onClose={onClose}
            onConfirm={() => void guardar(() => ServicoRH.alterarDepartamento(funcionarioIds, dep || null, actor), 'Departamento alterado')}>
            <CampoDialogo label="Novo departamento" largo>
                <Select value={dep} onValueChange={setDep}>
                    <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                    <SelectContent>{departamentos.filter(d => d.activo).map(d => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}</SelectContent>
                </Select>
            </CampoDialogo>
        </Moldura>
    );
}
