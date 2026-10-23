import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Switch } from '@/componentes/ui/switch';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { ServicoRH, type ActorRH, type Cargo, type Departamento, type Funcionario } from '@/servicos/rh/ServicoRH';
import { estadoBI, validadeSugerida } from '@/bibliotecas/rh/bi-validade';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { executar, paraMinor, SeloBI } from './comum-rh';

type Props = {
    open: boolean; onClose: () => void; onSaved: () => void; actor: ActorRH;
    funcionario?: Funcionario | null; departamentos: Departamento[]; cargos: Cargo[]; anosValidadeBI: number;
    horarios?: Array<{ id: string; nome: string; activo?: number }>;
};

const NENHUM = '__nenhum__';
const vazio = (): Partial<Funcionario> => ({ estado: 'activo', data_admissao: luandaTodayKey(), reformado: 0 });

function Campo({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
    return <div className={className}><Label className="text-xs font-bold text-slate-600 dark:text-slate-300">{label}</Label><div className="mt-1">{children}</div></div>;
}

export function FormularioFuncionario({ open, onClose, onSaved, actor, funcionario, departamentos, cargos, anosValidadeBI, horarios = [] }: Props) {
    const [f, setF] = useState<Partial<Funcionario>>(vazio());
    const [contrato, setContrato] = useState({ tipo: 'indeterminado' as 'indeterminado' | 'determinado', inicio: luandaTodayKey(), fim: '', periodo_experiencia_fim: '', salario: 0, horas_semanais: 40, dias_ferias: 22 });
    const [comContrato, setComContrato] = useState(true);
    const [aGuardar, setAGuardar] = useState(false);

    useEffect(() => {
        if (!open) return;
        if (funcionario) { setF({ ...funcionario }); return; }
        setF(vazio());
        setComContrato(true);
        setContrato(c => ({ ...c, inicio: luandaTodayKey(), salario: 0 }));
        void ServicoRH.proximoNumero().then(numero => setF(prev => ({ ...prev, numero_mecanografico: prev.numero_mecanografico || numero })));
    }, [open, funcionario]);

    const set = (campo: keyof Funcionario, valor: unknown) => setF(prev => ({ ...prev, [campo]: valor }));
    const sugestao = !f.bi_validade && f.bi_emissao ? validadeSugerida(f.bi_emissao, anosValidadeBI) : null;
    const cargo = cargos.find(c => c.id === f.cargo_id);

    const guardar = async () => {
        if (!actor) return;
        setAGuardar(true);
        const ok = await executar(async () => {
            if (funcionario) await ServicoRH.actualizarFuncionario(funcionario.id, f, actor);
            else await ServicoRH.criarFuncionario(f, comContrato ? {
                tipo: contrato.tipo, inicio: contrato.inicio, fim: contrato.fim || null, periodo_experiencia_fim: contrato.periodo_experiencia_fim || null,
                salario_base_minor: paraMinor(contrato.salario), horas_semanais: contrato.horas_semanais, dias_ferias: contrato.dias_ferias,
            } : null, actor);
        }, funcionario ? 'Ficha do funcionário actualizada' : 'Funcionário registado');
        setAGuardar(false);
        if (ok) { onSaved(); onClose(); }
    };

    return (
        <Dialog open={open} onOpenChange={value => !value && onClose()}>
            <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{funcionario ? `Editar ${funcionario.nome}` : 'Novo funcionário'}</DialogTitle>
                    <DialogDescription>Dados pessoais, identificação, contactos, banco e enquadramento na empresa.</DialogDescription>
                </DialogHeader>

                <section className="grid gap-3 sm:grid-cols-3">
                    <Campo label="N.º mecanográfico"><Input value={f.numero_mecanografico || ''} onChange={e => set('numero_mecanografico', e.target.value)} /></Campo>
                    <Campo label="Nome completo" className="sm:col-span-2"><Input value={f.nome || ''} onChange={e => set('nome', e.target.value)} /></Campo>
                    <Campo label="Data de nascimento"><Input type="date" value={f.data_nascimento || ''} onChange={e => set('data_nascimento', e.target.value)} /></Campo>
                    <Campo label="Sexo">
                        <Select value={f.sexo || NENHUM} onValueChange={v => set('sexo', v === NENHUM ? null : v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value={NENHUM}>—</SelectItem><SelectItem value="M">Masculino</SelectItem><SelectItem value="F">Feminino</SelectItem></SelectContent>
                        </Select>
                    </Campo>
                    <Campo label="Estado civil">
                        <Select value={f.estado_civil || NENHUM} onValueChange={v => set('estado_civil', v === NENHUM ? null : v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NENHUM}>—</SelectItem>
                                {['Solteiro(a)', 'Casado(a)', 'União de facto', 'Divorciado(a)', 'Viúvo(a)'].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </Campo>
                </section>

                <h3 className="mt-2 text-xs font-black uppercase tracking-wide text-slate-500">Identificação</h3>
                <section className="grid gap-3 sm:grid-cols-3">
                    <Campo label="N.º do BI"><Input value={f.bi_numero || ''} onChange={e => set('bi_numero', e.target.value.toUpperCase())} /></Campo>
                    <Campo label="Emissão do BI"><Input type="date" value={f.bi_emissao || ''} max={luandaTodayKey()} onChange={e => set('bi_emissao', e.target.value)} /></Campo>
                    <Campo label="Validade do BI">
                        <Input type="date" value={f.bi_validade || ''} onChange={e => set('bi_validade', e.target.value)} />
                        {sugestao && <button type="button" className="mt-1 text-[11px] font-bold text-sky-600 hover:underline" onClick={() => set('bi_validade', sugestao)}>Usar a sugestão: emissão + {anosValidadeBI} anos</button>}
                        {f.bi_validade && <div className="mt-1"><SeloBI situacao={estadoBI(f.bi_validade, luandaTodayKey(), 30)} detalhe /></div>}
                    </Campo>
                    <Campo label="NIF"><Input value={f.nif || ''} onChange={e => set('nif', e.target.value)} /></Campo>
                    <Campo label="N.º de Segurança Social (INSS)"><Input value={f.numero_inss || ''} onChange={e => set('numero_inss', e.target.value)} /></Campo>
                    <Campo label="Reformado no activo (INSS especial)">
                        <div className="flex h-10 items-center"><Switch checked={Boolean(f.reformado)} onCheckedChange={v => set('reformado', v ? 1 : 0)} /></div>
                    </Campo>
                </section>

                <h3 className="mt-2 text-xs font-black uppercase tracking-wide text-slate-500">Contactos e banco</h3>
                <section className="grid gap-3 sm:grid-cols-3">
                    <Campo label="Telefone"><Input value={f.telefone || ''} onChange={e => set('telefone', e.target.value)} /></Campo>
                    <Campo label="Email"><Input type="email" value={f.email || ''} onChange={e => set('email', e.target.value)} /></Campo>
                    <Campo label="Morada"><Input value={f.morada || ''} onChange={e => set('morada', e.target.value)} /></Campo>
                    <Campo label="Banco"><Input value={f.banco || ''} onChange={e => set('banco', e.target.value)} /></Campo>
                    <Campo label="IBAN" className="sm:col-span-2"><Input value={f.iban || ''} placeholder="AO06 …" onChange={e => set('iban', e.target.value.toUpperCase())} /></Campo>
                </section>

                <h3 className="mt-2 text-xs font-black uppercase tracking-wide text-slate-500">Na empresa</h3>
                <section className="grid gap-3 sm:grid-cols-3">
                    <Campo label="Data de admissão"><Input type="date" value={f.data_admissao || ''} onChange={e => set('data_admissao', e.target.value)} /></Campo>
                    <Campo label="Departamento">
                        <Select value={f.departamento_id || NENHUM} onValueChange={v => set('departamento_id', v === NENHUM ? null : v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value={NENHUM}>—</SelectItem>{departamentos.filter(d => d.activo).map(d => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}</SelectContent>
                        </Select>
                    </Campo>
                    <Campo label="Cargo">
                        <Select value={f.cargo_id || NENHUM} onValueChange={v => {
                            set('cargo_id', v === NENHUM ? null : v);
                            const escolhido = cargos.find(c => c.id === v);
                            if (escolhido?.departamento_id && !f.departamento_id) set('departamento_id', escolhido.departamento_id);
                        }}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value={NENHUM}>—</SelectItem>{cargos.filter(c => c.activo).map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                        </Select>
                    </Campo>
                    <Campo label="Horário">
                        <Select value={f.horario_id || NENHUM} onValueChange={v => set('horario_id', v === NENHUM ? null : v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value={NENHUM}>Horário normal</SelectItem>{horarios.filter(h => h.activo !== 0 && h.id !== 'horario-normal').map(h => <SelectItem key={h.id} value={h.id}>{h.nome}</SelectItem>)}</SelectContent>
                        </Select>
                    </Campo>
                    {funcionario && (
                        <Campo label="Estado">
                            <Select value={f.estado || 'activo'} onValueChange={v => set('estado', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="activo">Activo</SelectItem><SelectItem value="suspenso">Suspenso</SelectItem><SelectItem value="cessado">Cessado</SelectItem></SelectContent>
                            </Select>
                        </Campo>
                    )}
                    <Campo label="Observações" className="sm:col-span-3"><Textarea rows={2} value={f.observacoes || ''} onChange={e => set('observacoes', e.target.value)} /></Campo>
                </section>

                {!funcionario && (
                    <>
                        <div className="mt-2 flex items-center justify-between">
                            <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">Contrato inicial</h3>
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-600"><Switch checked={comContrato} onCheckedChange={setComContrato} /> Registar já o contrato</label>
                        </div>
                        {comContrato && (
                            <section className="grid gap-3 sm:grid-cols-3">
                                <Campo label="Tipo">
                                    <Select value={contrato.tipo} onValueChange={v => setContrato(c => ({ ...c, tipo: v as typeof c.tipo }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="indeterminado">Tempo indeterminado</SelectItem><SelectItem value="determinado">Termo certo (determinado)</SelectItem></SelectContent>
                                    </Select>
                                </Campo>
                                <Campo label="Início"><Input type="date" value={contrato.inicio} onChange={e => setContrato(c => ({ ...c, inicio: e.target.value }))} /></Campo>
                                <Campo label="Fim (termo certo)"><Input type="date" value={contrato.fim} disabled={contrato.tipo !== 'determinado'} onChange={e => setContrato(c => ({ ...c, fim: e.target.value }))} /></Campo>
                                <Campo label="Fim do período experimental"><Input type="date" value={contrato.periodo_experiencia_fim} onChange={e => setContrato(c => ({ ...c, periodo_experiencia_fim: e.target.value }))} /></Campo>
                                <Campo label={`Salário base${cargo?.salario_referencia_minor ? ` (referência ${(cargo.salario_referencia_minor / 100).toLocaleString('pt-PT')} Kz)` : ''}`}>
                                    <CurrencyInput value={contrato.salario} onValueChange={v => setContrato(c => ({ ...c, salario: v }))} />
                                </Campo>
                                <Campo label="Horas semanais / dias de férias">
                                    <div className="flex gap-2">
                                        <Input type="number" min={1} max={60} value={contrato.horas_semanais} onChange={e => setContrato(c => ({ ...c, horas_semanais: Number(e.target.value) }))} />
                                        <Input type="number" min={0} max={60} value={contrato.dias_ferias} onChange={e => setContrato(c => ({ ...c, dias_ferias: Number(e.target.value) }))} />
                                    </div>
                                </Campo>
                            </section>
                        )}
                    </>
                )}

                <DialogFooter className="mt-3">
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={guardar} disabled={aGuardar}>{aGuardar ? 'A guardar…' : 'Guardar'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
