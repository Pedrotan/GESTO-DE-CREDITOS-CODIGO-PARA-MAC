import { useMemo, useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { ChevronLeft, ChevronRight, Lock, Upload } from 'lucide-react';
import { ServicoTempoRH, type AusenciaRH } from '@/servicos/rh/ServicoTempoRH';
import { CORES_CODIGO, codigoDia, datasDoMes, diaSemana, feriadoNaData, HORARIO_OMISSAO, lerCsvPonto, resumoMes, type CodigoDia, type Feriado, type Horario, type TipoAusencia } from '@/bibliotecas/rh/ponto';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { NavegacaoRH, dataPt, executar, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import { toast } from '@/ganchos/usar-toast';
import { useBaseRH } from './FuncionariosRH';

export const LIGACOES_TEMPO = [
    { path: '/rh/ponto', label: 'Livro de ponto' },
    { path: '/rh/ausencias', label: 'Dispensas e licenças' },
    { path: '/rh/calendario', label: 'Horários e calendário' },
];
const TODOS = '__todos__';
const LEGENDA: Array<[CodigoDia, string]> = [['P', 'Presente'], ['F', 'Falta injustificada'], ['FJ', 'Falta justificada'], ['Fé', 'Férias'], ['D', 'Dispensa'], ['L', 'Licença'], ['FR', 'Feriado'], ['FS', 'Fim-de-semana'], ['?', 'Sem registo']];
const SEMANA = ['', 'S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

export default function LivroPontoRH() {
    const { actor, gerir } = useActorRH();
    const base = useBaseRH();
    const hoje = luandaTodayKey();
    const [ano, setAno] = useState(Number(hoje.slice(0, 4)));
    const [mes, setMes] = useState(Number(hoje.slice(5, 7)));
    const [departamento, setDepartamento] = useState(TODOS);
    const [celula, setCelula] = useState<{ funcionarioId: string; data: string } | null>(null);
    const [importar, setImportar] = useState(false);
    const dadosMes = useCarregar(async () => {
        const [pontos, ausencias, tipos, horarios, feriados, bloqueado] = await Promise.all([
            ServicoTempoRH.pontosMes(ano, mes), ServicoTempoRH.ausencias(), ServicoTempoRH.tiposAusencia(), ServicoTempoRH.horarios(), ServicoTempoRH.feriados(),
            ServicoTempoRH.mesBloqueado(`${ano}-${String(mes).padStart(2, '0')}-01`),
        ]);
        return { pontos, ausencias, tipos, horarios, feriados, bloqueado };
    }, { pontos: [] as Awaited<ReturnType<typeof ServicoTempoRH.pontosMes>>, ausencias: [] as AusenciaRH[], tipos: [] as TipoAusencia[], horarios: [] as Horario[], feriados: [] as Feriado[], bloqueado: null as string | null }, [ano, mes]);
    const { pontos, ausencias, tipos, horarios, feriados, bloqueado } = dadosMes.dados;

    const datas = datasDoMes(ano, mes);
    const mapaPontos = useMemo(() => new Map(pontos.map(p => [`${p.funcionario_id}:${p.data}`, p])), [pontos]);
    const mapaTipos = useMemo(() => new Map(tipos.map(t => [t.id, t])), [tipos]);
    const chaveMes = `${ano}-${String(mes).padStart(2, '0')}`;
    const funcionarios = base.dados.funcionarios.filter(f => (departamento === TODOS || f.departamento_id === departamento) &&
        f.data_admissao <= `${chaveMes}-31` && (!f.data_saida || f.data_saida >= `${chaveMes}-01`) && f.estado !== 'suspenso');
    const horarioDe = (id: string | null) => horarios.find(h => h.id === id) || horarios.find(h => h.id === 'horario-normal') || HORARIO_OMISSAO;
    const mover = (delta: number) => { const d = new Date(Date.UTC(ano, mes - 1 + delta, 1)); setAno(d.getUTCFullYear()); setMes(d.getUTCMonth() + 1); };

    return (
        <MainLayout title="Livro de ponto" subtitle="Entradas e saídas por dia, faltas, atrasos e horas extra">
            <NavegacaoRH extra={LIGACOES_TEMPO} />
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <Button size="icon" variant="outline" onClick={() => mover(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="min-w-[150px] text-center font-black capitalize">{new Date(Date.UTC(ano, mes - 1, 15)).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
                <Button size="icon" variant="outline" onClick={() => mover(1)}><ChevronRight className="h-4 w-4" /></Button>
                <Select value={departamento} onValueChange={setDepartamento}>
                    <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value={TODOS}>Todos os departamentos</SelectItem>{base.dados.departamentos.map(d => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}</SelectContent>
                </Select>
                {gerir && !bloqueado && <Button variant="outline" onClick={() => setImportar(true)}><Upload className="mr-1.5 h-4 w-4" /> Importar CSV do relógio</Button>}
                {bloqueado && <span className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"><Lock className="h-3.5 w-3.5" /> Mês processado ({bloqueado}): só leitura</span>}
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5 text-[11px]">
                {LEGENDA.map(([c, nome]) => <span key={c} className={`rounded px-1.5 py-0.5 font-bold ${CORES_CODIGO[c]}`}>{c} {nome}</span>)}
            </div>

            {funcionarios.length === 0 ? <Vazio>Sem funcionários activos neste mês.</Vazio> : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <table className="text-xs">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-950">
                                <th className="sticky left-0 z-10 min-w-[180px] bg-slate-50 px-3 py-2 text-left dark:bg-slate-950">Funcionário</th>
                                {datas.map(d => (
                                    <th key={d} title={feriadoNaData(feriados, d)?.nome} className={`w-8 px-0.5 py-1 text-center font-bold ${d === hoje ? 'text-sky-600' : 'text-slate-500'}`}>
                                        <div>{SEMANA[diaSemana(d)]}</div><div>{Number(d.slice(8))}</div>
                                    </th>
                                ))}
                                <th className="px-2 text-center">Faltas</th><th className="px-2 text-center">Atraso (min)</th><th className="px-2 text-center">H. extra</th>
                            </tr>
                        </thead>
                        <tbody>
                            {funcionarios.map(f => {
                                const horario = horarioDe(f.horario_id);
                                const resumo = resumoMes({ funcionarioId: f.id, ano, mes, horario, feriados, pontos, ausencias, tipos, admissao: f.data_admissao, saida: f.data_saida, hoje });
                                return (
                                    <tr key={f.id} className="border-t border-slate-100 dark:border-slate-800">
                                        <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-semibold dark:bg-slate-900">{f.nome}<div className="text-[10px] font-normal text-slate-400">{horario.nome}</div></td>
                                        {datas.map(d => {
                                            const codigo = codigoDia({ funcionarioId: f.id, data: d, horario, feriados, pontos: mapaPontos, ausencias, tipos: mapaTipos, admissao: f.data_admissao, saida: f.data_saida, hoje });
                                            const registo = mapaPontos.get(`${f.id}:${d}`);
                                            return (
                                                <td key={d} className="p-0.5 text-center">
                                                    <button type="button" disabled={!gerir || Boolean(bloqueado) || !codigo && d > hoje} onClick={() => setCelula({ funcionarioId: f.id, data: d })}
                                                        title={registo ? `${registo.entrada}–${registo.saida} · ${registo.horas_trabalhadas} h${registo.minutos_atraso ? ` · atraso ${registo.minutos_atraso} min` : ''}${registo.horas_extra ? ` · extra ${registo.horas_extra} h` : ''}` : undefined}
                                                        className={`h-7 w-7 rounded text-[10px] font-black ${CORES_CODIGO[codigo]} ${registo?.minutos_atraso ? 'ring-1 ring-orange-400' : ''} disabled:cursor-default`}>
                                                        {codigo}
                                                    </button>
                                                </td>
                                            );
                                        })}
                                        <td className="px-2 text-center font-bold text-red-600">{resumo.faltasDescontaveis || ''}{resumo.diasSemRegisto ? <span className="ml-1 text-[10px] font-normal text-slate-400">({resumo.diasSemRegisto} s/ reg.)</span> : null}</td>
                                        <td className="px-2 text-center">{resumo.minutosAtraso || ''}</td>
                                        <td className="px-2 text-center">{resumo.horasExtra + resumo.horasExtraFeriado || ''}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="mt-2 text-xs text-slate-500">Clique num dia para registar a entrada e a saída. As faltas, dispensas e licenças registam-se em «Dispensas e licenças». Dias úteis passados sem registo aparecem com «?»: só descontam no salário quando houver uma falta lançada.</p>

            {celula && actor && (
                <DialogoDia celula={celula} registo={mapaPontos.get(`${celula.funcionarioId}:${celula.data}`)} nome={base.dados.funcionarios.find(f => f.id === celula.funcionarioId)?.nome || ''}
                    actor={actor} onClose={() => setCelula(null)} onSaved={() => void dadosMes.recarregar()} />
            )}
            {importar && actor && <DialogoImportar actor={actor} onClose={() => setImportar(false)} onSaved={() => void dadosMes.recarregar()} />}
        </MainLayout>
    );
}

function DialogoDia({ celula, registo, nome, actor, onClose, onSaved }: {
    celula: { funcionarioId: string; data: string }; registo?: { entrada: string | null; saida: string | null; horas_trabalhadas: number; minutos_atraso: number; horas_extra: number };
    nome: string; actor: NonNullable<ReturnType<typeof useActorRH>['actor']>; onClose: () => void; onSaved: () => void;
}) {
    const [entrada, setEntrada] = useState(registo?.entrada || '08:00');
    const [saida, setSaida] = useState(registo?.saida || '17:00');
    const [observacoes, setObservacoes] = useState('');
    const [aGuardar, setAGuardar] = useState(false);
    const accao = async (fn: () => Promise<unknown>, msg: string) => { setAGuardar(true); const ok = await executar(fn, msg); setAGuardar(false); if (ok) { onSaved(); onClose(); } };
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>{nome}</DialogTitle><DialogDescription>Ponto de {dataPt(celula.data)}{registo ? ` · actual: ${registo.entrada}–${registo.saida}, ${registo.horas_trabalhadas} h` : ''}</DialogDescription></DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs font-bold">Entrada</Label><Input className="mt-1" type="time" value={entrada} onChange={e => setEntrada(e.target.value)} /></div>
                    <div><Label className="text-xs font-bold">Saída</Label><Input className="mt-1" type="time" value={saida} onChange={e => setSaida(e.target.value)} /></div>
                    <div className="col-span-2"><Label className="text-xs font-bold">Observações</Label><Input className="mt-1" value={observacoes} onChange={e => setObservacoes(e.target.value)} /></div>
                </div>
                <DialogFooter className="gap-2">
                    {registo && <Button variant="outline" className="text-red-600" disabled={aGuardar} onClick={() => void accao(() => ServicoTempoRH.removerPonto(celula.funcionarioId, celula.data, actor), 'Registo retirado')}>Retirar registo</Button>}
                    <Button disabled={aGuardar} onClick={() => void accao(() => ServicoTempoRH.registarPonto(celula.funcionarioId, celula.data, entrada, saida, observacoes, actor), 'Ponto registado')}>Guardar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DialogoImportar({ actor, onClose, onSaved }: { actor: NonNullable<ReturnType<typeof useActorRH>['actor']>; onClose: () => void; onSaved: () => void }) {
    const [ficheiro, setFicheiro] = useState<File | null>(null);
    const [resultado, setResultado] = useState<string[] | null>(null);
    const importar = async () => {
        if (!ficheiro) return;
        const { linhas, erros } = lerCsvPonto(await ficheiro.text());
        try {
            const r = await ServicoTempoRH.importarPonto(linhas, actor);
            setResultado([`${r.importadas} marcação(ões) importada(s).`, ...erros, ...r.erros]);
            onSaved();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Importação recusada', description: (error as Error).message });
        }
    };
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Importar marcações do relógio</DialogTitle>
                    <DialogDescription>Ficheiro CSV (exportado do Excel ou do relógio biométrico) com as colunas: n.º mecanográfico; data; entrada; saída. Ex.: <code>0001;2026-10-01;08:05;17:10</code></DialogDescription>
                </DialogHeader>
                <Input type="file" accept=".csv,.txt" onChange={e => setFicheiro(e.target.files?.[0] || null)} />
                {resultado && <ul className="max-h-48 overflow-y-auto rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800">{resultado.map((r, i) => <li key={i}>{r}</li>)}</ul>}
                <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button><Button disabled={!ficheiro} onClick={() => void importar()}>Importar</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
