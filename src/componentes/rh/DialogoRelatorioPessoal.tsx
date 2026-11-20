// Gerar relatórios pessoais: escolher o relatório e as opções → Gerar → pré-visualização → «Guardar na pasta» e/ou
// «Descarregar». Com vários funcionários (acções em massa) gera em lote: guarda na pasta de cada um e/ou descarrega em ZIP.
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Checkbox } from '@/componentes/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { PdfCanvasViewer } from '@/componentes/ui/PdfCanvasViewer';
import { Download, FolderInput, Save } from 'lucide-react';
import type { ActorRH, Funcionario } from '@/servicos/rh/ServicoRH';
import { ServicoModelosRH, type ModeloRH } from '@/servicos/rh/ServicoModelosRH';
import { bytesDeDataUrl, criarZip } from '@/bibliotecas/rh/zip-simples';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { toast } from '@/ganchos/usar-toast';
import { executar } from './comum-rh';
import { arquivarPdf, descarregarPdf, type ContextoRH } from './accoes-funcionario';
import { RELATORIOS_PESSOAIS, SECCOES_PERSONALIZADAS, gerarRelatorioPessoal, type OpcoesRelatorio, type RelatorioGerado, type SeccaoPersonalizada, type TipoRelatorio } from './relatorios-pessoais';

type Props = {
    funcionarios: Funcionario[]; tipoInicial?: TipoRelatorio; ctx: ContextoRH; settings: unknown; actor: ActorRH; salarios: boolean; gerir: boolean;
    onClose: () => void; onSaved?: () => void;
};

export function DialogoRelatorioPessoal({ funcionarios, tipoInicial = 'ficha', ctx, settings, actor, salarios, gerir, onClose, onSaved }: Props) {
    const lote = funcionarios.length > 1;
    const anoActual = Number(luandaTodayKey().slice(0, 4));
    const [tipo, setTipo] = useState<TipoRelatorio>(tipoInicial);
    const [op, setOp] = useState<OpcoesRelatorio>({ ano: anoActual, seccoes: ['dados', 'empresa', 'contratos'] });
    const [modelos, setModelos] = useState<ModeloRH[]>([]);
    const [gerado, setGerado] = useState<RelatorioGerado | null>(null);
    const [aGerar, setAGerar] = useState(false);
    const [progresso, setProgresso] = useState('');
    const [guardarPasta, setGuardarPasta] = useState(gerir);
    const [zip, setZip] = useState(true);
    const [nomeModelo, setNomeModelo] = useState('');
    const disponiveis = RELATORIOS_PESSOAIS.filter(r => (salarios || !r.salarial) && (gerir || r.tipo !== 'declaracao'));
    useEffect(() => { void ServicoModelosRH.modelos().then(setModelos); }, []);
    const modelosDeclaracao = modelos.filter(m => m.tipo === 'declaracao' && m.activo);
    const modelosRelatorio = modelos.filter(m => m.tipo === 'relatorio' && m.activo);
    const mudar = (parte: Partial<OpcoesRelatorio>) => { setOp(o => ({ ...o, ...parte })); setGerado(null); };

    const gerarUm = async () => {
        setAGerar(true);
        const ok = await executar(async () => setGerado(await gerarRelatorioPessoal(tipo, funcionarios[0], ctx, settings, actor, salarios, op)), 'Relatório gerado: reveja e guarde');
        setAGerar(false);
        return ok;
    };
    const gerarLote = async () => {
        setAGerar(true);
        await executar(async () => {
            const entradas: Array<{ nome: string; dados: Uint8Array }> = [];
            for (const [i, f] of funcionarios.entries()) {
                setProgresso(`${i + 1} de ${funcionarios.length}: ${f.nome}`);
                const r = await gerarRelatorioPessoal(tipo, f, ctx, settings, actor, salarios, op);
                if (guardarPasta) await arquivarPdf(f.id, r.chave, r.nome, r.pdf, r.origem, actor);
                if (zip) entradas.push({ nome: r.pdf.fileName, dados: bytesDeDataUrl(r.pdf.dataUrl) });
            }
            if (zip && entradas.length) {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(criarZip(entradas));
                a.download = `Relatorios-${tipo}-${luandaTodayKey()}.zip`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
            }
        }, `${funcionarios.length} relatório(s) gerado(s)`);
        setProgresso('');
        setAGerar(false);
        onSaved?.();
        onClose();
    };
    const guardar = async (descarregar: boolean) => {
        if (!gerado) return;
        if (descarregar) descarregarPdf(gerado.pdf);
        if (!gerir) return onClose();
        const ok = await executar(() => arquivarPdf(funcionarios[0].id, gerado.chave, gerado.nome, gerado.pdf, gerado.origem, actor),
            `Guardado em ${gerado.chave === 'declaracoes' ? 'Declarações' : 'Relatórios pessoais'}`);
        if (ok) { onSaved?.(); onClose(); }
    };
    const guardarModelo = async () => {
        if (!nomeModelo.trim()) return toast({ variant: 'destructive', title: 'Indique o nome do modelo' });
        const ok = await executar(() => ServicoModelosRH.guardar({ tipo: 'relatorio', nome: nomeModelo, conteudo: JSON.stringify({ seccoes: op.seccoes }) }, actor), 'Modelo de relatório guardado');
        if (ok) { setNomeModelo(''); void ServicoModelosRH.modelos().then(setModelos); }
    };
    const usaAno = tipo === 'assiduidade' || tipo === 'ferias' || (tipo === 'personalizado' && op.seccoes?.some(s => s === 'assiduidade' || s === 'ferias'));
    const usaPeriodo = tipo === 'personalizado' || tipo === 'historico';

    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className={gerado ? 'flex h-[92vh] max-w-5xl flex-col' : 'max-w-2xl'}>
                <DialogHeader>
                    <DialogTitle>{lote ? `Relatórios pessoais — ${funcionarios.length} funcionários` : `Relatório pessoal — ${funcionarios[0]?.nome}`}</DialogTitle>
                    <DialogDescription>PDF A4 com o logótipo e os dados da empresa. {lote ? 'Gera um por funcionário.' : 'Reveja na pré-visualização antes de guardar.'}</DialogDescription>
                </DialogHeader>

                {!gerado ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <Label htmlFor="rp-tipo" className="text-xs font-bold">Relatório</Label>
                            <Select value={tipo} onValueChange={v => { setTipo(v as TipoRelatorio); setGerado(null); }}>
                                <SelectTrigger id="rp-tipo" className="mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>{disponiveis.map(r => <SelectItem key={r.tipo} value={r.tipo}>{r.nome}</SelectItem>)}</SelectContent>
                            </Select>
                            <p className="mt-1 text-xs text-rh-muted">{RELATORIOS_PESSOAIS.find(r => r.tipo === tipo)?.descricao}</p>
                        </div>
                        {tipo === 'declaracao' && <>
                            <div>
                                <Label htmlFor="rp-modelo" className="text-xs font-bold">Modelo</Label>
                                <Select value={op.modeloId || modelosDeclaracao[0]?.id || ''} onValueChange={v => mudar({ modeloId: v })}>
                                    <SelectTrigger id="rp-modelo" className="mt-1"><SelectValue placeholder="Modelo do sistema" /></SelectTrigger>
                                    <SelectContent>{modelosDeclaracao.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div><Label htmlFor="rp-fin" className="text-xs font-bold">Finalidade (opcional)</Label><Input id="rp-fin" className="mt-1" placeholder="Ex.: abertura de conta bancária" value={op.finalidade || ''} onChange={e => mudar({ finalidade: e.target.value })} /></div>
                        </>}
                        {usaAno && <div><Label htmlFor="rp-ano" className="text-xs font-bold">Ano</Label><Input id="rp-ano" type="number" className="mt-1" min={2000} max={anoActual + 1} value={op.ano} onChange={e => mudar({ ano: Number(e.target.value) })} /></div>}
                        {usaPeriodo && <>
                            <div><Label htmlFor="rp-de" className="text-xs font-bold">Período: de</Label><Input id="rp-de" type="date" className="mt-1" value={op.de || ''} onChange={e => mudar({ de: e.target.value || undefined })} /></div>
                            <div><Label htmlFor="rp-ate" className="text-xs font-bold">até</Label><Input id="rp-ate" type="date" className="mt-1" value={op.ate || ''} onChange={e => mudar({ ate: e.target.value || undefined })} /></div>
                        </>}
                        {tipo === 'personalizado' && (
                            <div className="space-y-3 sm:col-span-2">
                                {modelosRelatorio.length > 0 && (
                                    <div>
                                        <Label className="text-xs font-bold">Usar um modelo guardado</Label>
                                        <Select onValueChange={id => { try { mudar({ seccoes: JSON.parse(modelosRelatorio.find(m => m.id === id)!.conteudo).seccoes }); } catch { /* modelo ilegível */ } }}>
                                            <SelectTrigger className="mt-1"><SelectValue placeholder="Escolher modelo" /></SelectTrigger>
                                            <SelectContent>{modelosRelatorio.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                )}
                                <fieldset>
                                    <legend className="mb-1.5 text-xs font-bold">Secções</legend>
                                    <div className="grid grid-cols-2 gap-2">
                                        {SECCOES_PERSONALIZADAS.filter(s => salarios || !s.salarial).map(s => (
                                            <label key={s.id} className="flex items-center gap-2 text-sm">
                                                <Checkbox checked={op.seccoes?.includes(s.id)} onCheckedChange={v => mudar({ seccoes: v ? [...(op.seccoes || []), s.id] : (op.seccoes || []).filter(x => x !== s.id) as SeccaoPersonalizada[] })} />{s.nome}
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                                {gerir && <div className="flex gap-2"><Input aria-label="Nome do modelo" placeholder="Guardar estas secções como modelo…" value={nomeModelo} onChange={e => setNomeModelo(e.target.value)} /><Button variant="outline" onClick={() => void guardarModelo()}><Save className="mr-1.5 h-4 w-4" /> Guardar modelo</Button></div>}
                            </div>
                        )}
                        {lote && (
                            <div className="space-y-2 rounded-xl border border-rh-border p-3 sm:col-span-2">
                                {gerir && <label className="flex items-center gap-2 text-sm"><Checkbox checked={guardarPasta} onCheckedChange={v => setGuardarPasta(Boolean(v))} /> Guardar na pasta pessoal de cada funcionário</label>}
                                <label className="flex items-center gap-2 text-sm"><Checkbox checked={zip} onCheckedChange={v => setZip(Boolean(v))} /> Descarregar todos num ZIP</label>
                                {progresso && <p className="text-xs font-semibold text-rh-link" role="status">A gerar {progresso}…</p>}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-slate-100 p-2 dark:bg-slate-900"><PdfCanvasViewer source={gerado.pdf.dataUrl} /></div>
                )}

                <DialogFooter className="gap-2">
                    {!gerado ? <>
                        <Button variant="outline" onClick={onClose}>Cancelar</Button>
                        {lote
                            ? <Button className="bg-rh-navy hover:bg-rh-navy-2" disabled={aGerar || (!guardarPasta && !zip) || (tipo === 'personalizado' && !op.seccoes?.length)} onClick={() => void gerarLote()}>{aGerar ? 'A gerar…' : `Gerar ${funcionarios.length} relatórios`}</Button>
                            : <Button className="bg-rh-navy hover:bg-rh-navy-2" disabled={aGerar || (tipo === 'personalizado' && !op.seccoes?.length)} onClick={() => void gerarUm()}>{aGerar ? 'A gerar…' : 'Gerar'}</Button>}
                    </> : <>
                        <Button variant="ghost" onClick={() => setGerado(null)}>← Opções</Button>
                        <Button variant="outline" onClick={() => descarregarPdf(gerado.pdf)}><Download className="mr-1.5 h-4 w-4" /> Descarregar</Button>
                        {gerir && <Button variant="outline" onClick={() => void guardar(false)}><FolderInput className="mr-1.5 h-4 w-4" /> Guardar na pasta</Button>}
                        {gerir && <Button className="bg-rh-navy hover:bg-rh-navy-2" onClick={() => void guardar(true)}>Guardar e descarregar</Button>}
                    </>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
