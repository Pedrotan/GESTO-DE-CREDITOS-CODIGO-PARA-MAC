import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componentes/ui/tabs';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Edit, Plus, Trash2, UserX } from 'lucide-react';
import { ServicoRH, type ActorRH, type Cargo, type Contrato, type Departamento, type DocumentoRH, type Funcionario, type FuncionarioRubrica, type Rubrica } from '@/servicos/rh/ServicoRH';
import { estadoBI } from '@/bibliotecas/rh/bi-validade';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { ArquivoDocumentos } from './ArquivoDocumentos';
import { dataPt, executar, kz, paraMinor, SeloBI, useCarregar, Vazio } from './comum-rh';

type Permissoes = { gerir: boolean; salarios: boolean; confidencial: boolean };
type Props = {
    funcionario: Funcionario; departamentos: Departamento[]; cargos: Cargo[]; rubricas: Rubrica[]; funcionarios: Funcionario[];
    actor: ActorRH | null; permissoes: Permissoes; maxMb: number; onClose: () => void; onEditar: () => void; onChange: () => void;
};

function Linha({ label, valor }: { label: string; valor: React.ReactNode }) {
    return <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5 text-sm dark:border-slate-800"><span className="text-slate-500">{label}</span><span className="text-right font-semibold">{valor || '—'}</span></div>;
}

export function FichaFuncionario({ funcionario: f, departamentos, cargos, rubricas, funcionarios, actor, permissoes, maxMb, onClose, onEditar, onChange }: Props) {
    const id = f.id;
    const contratos = useCarregar(() => ServicoRH.contratos(id), [] as Contrato[], [id]);
    const historico = useCarregar(() => (permissoes.salarios ? ServicoRH.historicoSalarial(id) : Promise.resolve([])), [], [id, permissoes.salarios]);
    const fixas = useCarregar(() => (permissoes.salarios ? ServicoRH.rubricasFuncionario(id) : Promise.resolve([] as FuncionarioRubrica[])), [] as FuncionarioRubrica[], [id, permissoes.salarios]);
    const dependentes = useCarregar(() => ServicoRH.dependentes(id), [], [id]);
    const documentos = useCarregar(() => ServicoRH.documentos(id), [] as DocumentoRH[], [id]);
    const [dialogo, setDialogo] = useState<null | 'contrato' | 'cessar' | 'rubrica' | 'dependente'>(null);
    const activo = contratos.dados.find(c => c.estado === 'activo');
    const hoje = luandaTodayKey();
    const nomeRubrica = (rid: string) => rubricas.find(r => r.id === rid)?.nome || '—';
    const recarregarTudo = () => { void contratos.recarregar(); void historico.recarregar(); void fixas.recarregar(); onChange(); };

    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex flex-wrap items-center gap-3">
                        {f.nome}
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">N.º {f.numero_mecanografico}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${f.estado === 'activo' ? 'bg-emerald-100 text-emerald-700' : f.estado === 'suspenso' ? 'bg-orange-100 text-orange-700' : 'bg-slate-200 text-slate-600'}`}>{f.estado}</span>
                    </DialogTitle>
                    <DialogDescription>
                        {cargos.find(c => c.id === f.cargo_id)?.nome || 'Sem cargo'} · {departamentos.find(d => d.id === f.departamento_id)?.nome || 'Sem departamento'} · admitido a {dataPt(f.data_admissao)}
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="dados">
                    <TabsList className="flex-wrap">
                        <TabsTrigger value="dados">Dados</TabsTrigger>
                        <TabsTrigger value="contrato">Contrato</TabsTrigger>
                        {permissoes.salarios && <TabsTrigger value="rubricas">Rubricas fixas</TabsTrigger>}
                        {permissoes.salarios && <TabsTrigger value="historico">Histórico salarial</TabsTrigger>}
                        <TabsTrigger value="dependentes">Dependentes</TabsTrigger>
                        <TabsTrigger value="documentos">Documentos</TabsTrigger>
                    </TabsList>

                    <TabsContent value="dados" className="grid gap-x-8 sm:grid-cols-2">
                        <div>
                            <Linha label="Data de nascimento" valor={dataPt(f.data_nascimento)} />
                            <Linha label="Sexo" valor={f.sexo === 'M' ? 'Masculino' : f.sexo === 'F' ? 'Feminino' : null} />
                            <Linha label="Estado civil" valor={f.estado_civil} />
                            <Linha label="N.º do BI" valor={f.bi_numero} />
                            <Linha label="Emissão / validade do BI" valor={`${dataPt(f.bi_emissao)} — ${dataPt(f.bi_validade)}`} />
                            <Linha label="Situação do BI" valor={<SeloBI situacao={estadoBI(f.bi_validade, hoje, 30)} detalhe />} />
                            <Linha label="NIF" valor={f.nif} />
                            <Linha label="N.º INSS" valor={f.numero_inss} />
                        </div>
                        <div>
                            <Linha label="Telefone" valor={f.telefone} />
                            <Linha label="Email" valor={f.email} />
                            <Linha label="Morada" valor={f.morada} />
                            <Linha label="Banco" valor={f.banco} />
                            <Linha label="IBAN" valor={permissoes.salarios ? f.iban : f.iban ? `${f.iban.slice(0, 4)} •••• ${f.iban.slice(-4)}` : null} />
                            <Linha label="Reformado no activo" valor={f.reformado ? 'Sim (INSS especial)' : 'Não'} />
                            {f.data_saida && <Linha label="Data de saída" valor={dataPt(f.data_saida)} />}
                            <Linha label="Observações" valor={f.observacoes} />
                        </div>
                        {permissoes.gerir && <div className="pt-3 sm:col-span-2"><Button size="sm" variant="outline" onClick={onEditar}><Edit className="mr-1.5 h-4 w-4" /> Editar ficha</Button></div>}
                    </TabsContent>

                    <TabsContent value="contrato" className="space-y-3">
                        {activo ? (
                            <div className="grid gap-x-8 rounded-2xl border border-slate-200 p-4 dark:border-slate-800 sm:grid-cols-2">
                                <div>
                                    <Linha label="Tipo" valor={activo.tipo === 'indeterminado' ? 'Tempo indeterminado' : 'Termo certo'} />
                                    <Linha label="Início" valor={dataPt(activo.inicio)} />
                                    <Linha label="Fim" valor={dataPt(activo.fim)} />
                                    <Linha label="Fim do período experimental" valor={dataPt(activo.periodo_experiencia_fim)} />
                                </div>
                                <div>
                                    <Linha label="Salário base" valor={permissoes.salarios ? kz(activo.salario_base_minor) : '•••'} />
                                    <Linha label="Horas semanais" valor={activo.horas_semanais} />
                                    <Linha label="Dias de férias por ano" valor={activo.dias_ferias} />
                                </div>
                            </div>
                        ) : <Vazio>Sem contrato activo.</Vazio>}
                        {permissoes.gerir && f.estado !== 'cessado' && (
                            <div className="flex gap-2">
                                <Button size="sm" onClick={() => setDialogo('contrato')}><Plus className="mr-1.5 h-4 w-4" /> {activo ? 'Novo contrato / alteração salarial' : 'Registar contrato'}</Button>
                                {activo && <Button size="sm" variant="outline" className="text-red-600" onClick={() => setDialogo('cessar')}><UserX className="mr-1.5 h-4 w-4" /> Cessar contrato</Button>}
                            </div>
                        )}
                        {contratos.dados.filter(c => c.estado !== 'activo').length > 0 && (
                            <div>
                                <h4 className="mb-1 text-xs font-black uppercase text-slate-500">Contratos anteriores</h4>
                                {contratos.dados.filter(c => c.estado !== 'activo').map(c => (
                                    <div key={c.id} className="flex justify-between border-b border-slate-100 py-1.5 text-sm dark:border-slate-800">
                                        <span>{c.tipo === 'indeterminado' ? 'Indeterminado' : 'Termo certo'} · {dataPt(c.inicio)} a {dataPt(c.fim)}</span>
                                        <span className="text-slate-500">{permissoes.salarios ? kz(c.salario_base_minor) : ''} {c.motivo_fim ? `· ${c.motivo_fim}` : ''}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    {permissoes.salarios && (
                        <TabsContent value="rubricas" className="space-y-3">
                            <p className="text-xs text-slate-500">Subsídios e descontos fixos, além do salário base. Entram em todos os processamentos entre o início e o fim.</p>
                            {fixas.dados.length === 0 ? <Vazio>Sem rubricas fixas.</Vazio> : (
                                <table className="w-full text-sm">
                                    <thead className="text-left text-[11px] uppercase text-slate-500"><tr><th className="py-1.5">Rubrica</th><th>Valor</th><th>Início</th><th>Fim</th><th /></tr></thead>
                                    <tbody>
                                        {fixas.dados.map(r => (
                                            <tr key={r.id} className={`border-t border-slate-100 dark:border-slate-800 ${r.fim && r.fim < hoje ? 'text-slate-400' : ''}`}>
                                                <td className="py-1.5 font-semibold">{nomeRubrica(r.rubrica_id)}</td><td>{kz(r.valor_minor)}{r.quantidade !== 1 ? ` × ${r.quantidade}` : ''}</td>
                                                <td>{dataPt(r.inicio)}</td><td>{dataPt(r.fim)}</td>
                                                <td className="text-right">{permissoes.gerir && !r.fim && actor && (
                                                    <Button size="sm" variant="ghost" onClick={() => void executar(() => ServicoRH.terminarRubrica(r.id, hoje, actor), 'Rubrica terminada hoje').then(ok => ok && fixas.recarregar())}>Terminar</Button>
                                                )}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                            {permissoes.gerir && <Button size="sm" onClick={() => setDialogo('rubrica')}><Plus className="mr-1.5 h-4 w-4" /> Atribuir rubrica</Button>}
                        </TabsContent>
                    )}

                    {permissoes.salarios && (
                        <TabsContent value="historico">
                            {historico.dados.length === 0 ? <Vazio>Sem histórico salarial.</Vazio> : (
                                <table className="w-full text-sm">
                                    <thead className="text-left text-[11px] uppercase text-slate-500"><tr><th className="py-1.5">Data de efeito</th><th>Anterior</th><th>Novo</th><th>Variação</th><th>Motivo</th><th>Registado por</th></tr></thead>
                                    <tbody>
                                        {historico.dados.map(h => (
                                            <tr key={h.id} className="border-t border-slate-100 dark:border-slate-800">
                                                <td className="py-1.5">{dataPt(h.data_efeito)}</td><td>{h.salario_anterior_minor === null ? '—' : kz(h.salario_anterior_minor)}</td>
                                                <td className="font-semibold">{kz(h.salario_novo_minor)}</td>
                                                <td>{h.salario_anterior_minor ? `${(((h.salario_novo_minor - h.salario_anterior_minor) / h.salario_anterior_minor) * 100).toFixed(1)}%` : '—'}</td>
                                                <td>{h.motivo}</td><td className="text-xs text-slate-500">{h.criado_por_nome || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </TabsContent>
                    )}

                    <TabsContent value="dependentes" className="space-y-3">
                        {dependentes.dados.length === 0 ? <Vazio>Sem dependentes registados.</Vazio> : dependentes.dados.map(d => (
                            <div key={d.id} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-sm dark:border-slate-800">
                                <span><b>{d.nome}</b> · {d.parentesco || '—'} · {dataPt(d.data_nascimento)}</span>
                                {permissoes.gerir && actor && <Button size="icon" variant="ghost" onClick={() => void executar(() => ServicoRH.removerDependente(d.id, id, actor), 'Dependente retirado').then(ok => ok && dependentes.recarregar())}><Trash2 className="h-4 w-4" /></Button>}
                            </div>
                        ))}
                        {permissoes.gerir && <Button size="sm" onClick={() => setDialogo('dependente')}><Plus className="mr-1.5 h-4 w-4" /> Acrescentar dependente</Button>}
                    </TabsContent>

                    <TabsContent value="documentos">
                        <ArquivoDocumentos documentos={documentos.dados} funcionarios={funcionarios} actor={actor} podeGerir={permissoes.gerir}
                            podeConfidencial={permissoes.confidencial} maxMb={maxMb} funcionarioFixo={id} onChange={() => void documentos.recarregar()} />
                    </TabsContent>
                </Tabs>

                {actor && dialogo === 'contrato' && <DialogoContrato funcionarioId={id} actual={activo} actor={actor} onClose={() => setDialogo(null)} onSaved={recarregarTudo} />}
                {actor && dialogo === 'cessar' && <DialogoCessar funcionarioId={id} actor={actor} onClose={() => setDialogo(null)} onSaved={recarregarTudo} />}
                {actor && dialogo === 'rubrica' && <DialogoRubrica funcionarioId={id} rubricas={rubricas} actor={actor} onClose={() => setDialogo(null)} onSaved={() => void fixas.recarregar()} />}
                {actor && dialogo === 'dependente' && <DialogoDependente funcionarioId={id} actor={actor} onClose={() => setDialogo(null)} onSaved={() => void dependentes.recarregar()} />}
            </DialogContent>
        </Dialog>
    );
}

type DialogoBase = { funcionarioId: string; actor: ActorRH; onClose: () => void; onSaved: () => void };

function Moldura({ titulo, descricao, children, onClose, onConfirm, aGuardar }: { titulo: string; descricao?: string; children: React.ReactNode; onClose: () => void; onConfirm: () => void; aGuardar: boolean }) {
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>{titulo}</DialogTitle>{descricao && <DialogDescription>{descricao}</DialogDescription>}</DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">{children}</div>
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={aGuardar} onClick={onConfirm}>{aGuardar ? 'A guardar…' : 'Guardar'}</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const Campo = ({ label, children, largo }: { label: string; children: React.ReactNode; largo?: boolean }) =>
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

function DialogoContrato({ funcionarioId, actual, actor, onClose, onSaved }: DialogoBase & { actual?: Contrato }) {
    const [c, setC] = useState({
        tipo: actual?.tipo || 'indeterminado', inicio: luandaTodayKey(), fim: '', periodo_experiencia_fim: '',
        salario: (actual?.salario_base_minor || 0) / 100, horas_semanais: actual?.horas_semanais || 40, dias_ferias: actual?.dias_ferias || 22, motivo: actual ? 'Actualização salarial' : 'Admissão',
    });
    const { aGuardar, guardar } = useGuardar(onSaved, onClose);
    return (
        <Moldura titulo={actual ? 'Novo contrato ou alteração salarial' : 'Registar contrato'} aGuardar={aGuardar} onClose={onClose}
            descricao="O contrato actual termina e fica no histórico; a alteração do salário fica registada com o valor anterior."
            onConfirm={() => void guardar(() => ServicoRH.novoContrato(funcionarioId, { tipo: c.tipo as Contrato['tipo'], inicio: c.inicio, fim: c.fim || null,
                periodo_experiencia_fim: c.periodo_experiencia_fim || null, salario_base_minor: paraMinor(c.salario), horas_semanais: c.horas_semanais, dias_ferias: c.dias_ferias }, c.motivo, actor), 'Contrato registado')}>
            <Campo label="Tipo">
                <Select value={c.tipo} onValueChange={v => setC(p => ({ ...p, tipo: v as Contrato['tipo'] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="indeterminado">Tempo indeterminado</SelectItem><SelectItem value="determinado">Termo certo</SelectItem></SelectContent>
                </Select>
            </Campo>
            <Campo label="Data de efeito / início"><Input type="date" value={c.inicio} onChange={e => setC(p => ({ ...p, inicio: e.target.value }))} /></Campo>
            <Campo label="Fim (termo certo)"><Input type="date" value={c.fim} disabled={c.tipo !== 'determinado'} onChange={e => setC(p => ({ ...p, fim: e.target.value }))} /></Campo>
            <Campo label="Fim do período experimental"><Input type="date" value={c.periodo_experiencia_fim} onChange={e => setC(p => ({ ...p, periodo_experiencia_fim: e.target.value }))} /></Campo>
            <Campo label="Salário base"><CurrencyInput value={c.salario} onValueChange={v => setC(p => ({ ...p, salario: v }))} /></Campo>
            <Campo label="Horas semanais / dias de férias">
                <div className="flex gap-2">
                    <Input type="number" value={c.horas_semanais} onChange={e => setC(p => ({ ...p, horas_semanais: Number(e.target.value) }))} />
                    <Input type="number" value={c.dias_ferias} onChange={e => setC(p => ({ ...p, dias_ferias: Number(e.target.value) }))} />
                </div>
            </Campo>
            <Campo label="Motivo" largo><Input value={c.motivo} onChange={e => setC(p => ({ ...p, motivo: e.target.value }))} /></Campo>
        </Moldura>
    );
}

function DialogoCessar({ funcionarioId, actor, onClose, onSaved }: DialogoBase) {
    const [dataSaida, setDataSaida] = useState(luandaTodayKey());
    const [motivo, setMotivo] = useState('');
    const { aGuardar, guardar } = useGuardar(onSaved, onClose);
    return (
        <Moldura titulo="Cessar contrato" descricao="O funcionário passa a «cessado»; os registos e o histórico mantêm-se." aGuardar={aGuardar} onClose={onClose}
            onConfirm={() => void guardar(() => ServicoRH.cessarContrato(funcionarioId, dataSaida, motivo, actor), 'Contrato cessado')}>
            <Campo label="Data de saída"><Input type="date" value={dataSaida} onChange={e => setDataSaida(e.target.value)} /></Campo>
            <Campo label="Motivo"><Input value={motivo} placeholder="Ex.: fim do termo, rescisão" onChange={e => setMotivo(e.target.value)} /></Campo>
        </Moldura>
    );
}

function DialogoRubrica({ funcionarioId, rubricas, actor, onClose, onSaved }: DialogoBase & { rubricas: Rubrica[] }) {
    const escolhiveis = rubricas.filter(r => r.activo && !r.sistema);
    const [rubricaId, setRubricaId] = useState(escolhiveis[0]?.id || '');
    const [valor, setValor] = useState(0);
    const [inicio, setInicio] = useState(luandaTodayKey());
    const [fim, setFim] = useState('');
    const { aGuardar, guardar } = useGuardar(onSaved, onClose);
    return (
        <Moldura titulo="Atribuir rubrica fixa" aGuardar={aGuardar} onClose={onClose}
            onConfirm={() => void guardar(() => ServicoRH.atribuirRubrica(funcionarioId, { rubrica_id: rubricaId, valor_minor: paraMinor(valor), inicio, fim: fim || null }, actor), 'Rubrica atribuída')}>
            <Campo label="Rubrica" largo>
                <Select value={rubricaId} onValueChange={setRubricaId}>
                    <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                    <SelectContent>{escolhiveis.map(r => <SelectItem key={r.id} value={r.id}>{r.nome} ({r.tipo})</SelectItem>)}</SelectContent>
                </Select>
            </Campo>
            <Campo label="Valor mensal"><CurrencyInput value={valor} onValueChange={setValor} /></Campo>
            <Campo label="Início"><Input type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></Campo>
            <Campo label="Fim (opcional)"><Input type="date" value={fim} onChange={e => setFim(e.target.value)} /></Campo>
        </Moldura>
    );
}

function DialogoDependente({ funcionarioId, actor, onClose, onSaved }: DialogoBase) {
    const [d, setD] = useState({ nome: '', parentesco: 'Filho(a)', data_nascimento: '' });
    const { aGuardar, guardar } = useGuardar(onSaved, onClose);
    return (
        <Moldura titulo="Acrescentar dependente" aGuardar={aGuardar} onClose={onClose}
            onConfirm={() => void guardar(() => ServicoRH.adicionarDependente(funcionarioId, d, actor), 'Dependente acrescentado')}>
            <Campo label="Nome" largo><Input value={d.nome} onChange={e => setD(p => ({ ...p, nome: e.target.value }))} /></Campo>
            <Campo label="Parentesco"><Input value={d.parentesco} onChange={e => setD(p => ({ ...p, parentesco: e.target.value }))} /></Campo>
            <Campo label="Data de nascimento"><Input type="date" value={d.data_nascimento} onChange={e => setD(p => ({ ...p, data_nascimento: e.target.value }))} /></Campo>
        </Moldura>
    );
}
