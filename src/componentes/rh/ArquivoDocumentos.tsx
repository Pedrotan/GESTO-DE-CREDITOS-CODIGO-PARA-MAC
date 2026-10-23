import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Switch } from '@/componentes/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { FileUp, Eye, Archive, Lock, RefreshCw } from 'lucide-react';
import { CATEGORIAS_CONFIDENCIAIS, CATEGORIAS_DOCUMENTO, ServicoRH, type ActorRH, type CategoriaDocumento, type DocumentoRH, type Funcionario } from '@/servicos/rh/ServicoRH';
import { estadoBI } from '@/bibliotecas/rh/bi-validade';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { toast } from '@/ganchos/usar-toast';
import { abrirDataUrl, dataPt, executar, lerFicheiro, SeloBI, Vazio } from './comum-rh';

const nomeCategoria = (id: string) => CATEGORIAS_DOCUMENTO.find(c => c.id === id)?.nome || id;

type Props = {
    documentos: DocumentoRH[]; funcionarios: Funcionario[]; actor: ActorRH | null; podeGerir: boolean; podeConfidencial: boolean;
    maxMb: number; onChange: () => void; funcionarioFixo?: string; mostrarFuncionario?: boolean;
};

/** Lista e carregamento de documentos (ficha do funcionário e página Documentos). */
export function ArquivoDocumentos({ documentos, funcionarios, actor, podeGerir, podeConfidencial, maxMb, onChange, funcionarioFixo, mostrarFuncionario }: Props) {
    const [mostrarHistorico, setMostrarHistorico] = useState(false);
    const [novo, setNovo] = useState<null | { substitui?: DocumentoRH }>(null);
    const hoje = luandaTodayKey();
    const nomes = useMemo(() => new Map(funcionarios.map(f => [f.id, f.nome])), [funcionarios]);
    const visiveis = documentos.filter(d => (mostrarHistorico || d.estado === 'activo') && (podeConfidencial || !d.confidencial));
    const ocultos = documentos.filter(d => d.estado === 'activo' && d.confidencial && !podeConfidencial).length;

    const abrir = async (d: DocumentoRH) => {
        const url = await ServicoRH.ficheiroDocumento(d.id);
        if (!url) return void toast({ variant: 'destructive', title: 'Ficheiro indisponível', description: 'O ficheiro ainda não chegou a este computador (sincronização em curso).' });
        abrirDataUrl(url, d.ficheiro_nome);
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                    <Switch checked={mostrarHistorico} onCheckedChange={setMostrarHistorico} /> Mostrar substituídos e arquivados
                </label>
                {podeGerir && funcionarioFixo && <Button size="sm" onClick={() => setNovo({})}><FileUp className="mr-1.5 h-4 w-4" /> Carregar documento</Button>}
            </div>
            {ocultos > 0 && <p className="flex items-center gap-1.5 text-xs text-slate-500"><Lock className="h-3.5 w-3.5" /> {ocultos} documento(s) confidencial(is) não mostrado(s): exigem a permissão «RH: Documentos confidenciais».</p>}
            {visiveis.length === 0 ? <Vazio>Sem documentos.</Vazio> : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500 dark:bg-slate-900">
                            <tr>
                                {mostrarFuncionario && <th className="px-3 py-2">Funcionário</th>}
                                <th className="px-3 py-2">Documento</th><th className="px-3 py-2">Categoria</th><th className="px-3 py-2">Emissão</th>
                                <th className="px-3 py-2">Validade</th><th className="px-3 py-2">Carregado por</th><th className="px-3 py-2 text-right">Acções</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visiveis.map(d => (
                                <tr key={d.id} className="border-t border-slate-100 dark:border-slate-800">
                                    {mostrarFuncionario && <td className="px-3 py-2 font-semibold">{nomes.get(d.funcionario_id) || '—'}</td>}
                                    <td className="px-3 py-2">
                                        <span className="font-semibold">{d.nome}</span>
                                        {d.confidencial ? <Lock className="ml-1 inline h-3 w-3 text-slate-400" /> : null}
                                        {d.estado !== 'activo' && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800">{d.estado === 'substituido' ? 'substituído' : 'arquivado'}</span>}
                                        <div className="text-[11px] text-slate-400">{d.ficheiro_nome} · {(d.tamanho / 1024).toFixed(0)} KB</div>
                                    </td>
                                    <td className="px-3 py-2">{nomeCategoria(d.categoria)}</td>
                                    <td className="px-3 py-2">{dataPt(d.data_emissao)}</td>
                                    <td className="px-3 py-2">{d.data_validade ? <SeloBI situacao={{ ...estadoBI(d.data_validade, hoje, 30), texto: `Válido até ${dataPt(d.data_validade)}` }} /> : '—'} <span className="ml-1 text-xs">{d.data_validade ? dataPt(d.data_validade) : ''}</span></td>
                                    <td className="px-3 py-2 text-xs">{d.carregado_por_nome || '—'}<div className="text-slate-400">{dataPt(d.criado_em)}</div></td>
                                    <td className="whitespace-nowrap px-3 py-2 text-right">
                                        <Button size="icon" variant="ghost" title="Abrir" onClick={() => void abrir(d)}><Eye className="h-4 w-4" /></Button>
                                        {podeGerir && d.estado === 'activo' && <Button size="icon" variant="ghost" title="Carregar nova versão" onClick={() => setNovo({ substitui: d })}><RefreshCw className="h-4 w-4" /></Button>}
                                        {podeGerir && d.estado === 'activo' && actor && <Button size="icon" variant="ghost" title="Arquivar" onClick={() => void executar(() => ServicoRH.arquivarDocumento(d.id, actor), 'Documento arquivado').then(ok => ok && onChange())}><Archive className="h-4 w-4" /></Button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {novo && actor && (
                <CarregarDocumento funcionarioId={funcionarioFixo || novo.substitui!.funcionario_id} substitui={novo.substitui} actor={actor} maxMb={maxMb}
                    podeConfidencial={podeConfidencial} onClose={() => setNovo(null)} onSaved={onChange} />
            )}
        </div>
    );
}

function CarregarDocumento({ funcionarioId, substitui, actor, maxMb, podeConfidencial, onClose, onSaved }: {
    funcionarioId: string; substitui?: DocumentoRH; actor: ActorRH; maxMb: number; podeConfidencial: boolean; onClose: () => void; onSaved: () => void;
}) {
    const [categoria, setCategoria] = useState<CategoriaDocumento>(substitui?.categoria || 'identificacao');
    const [nome, setNome] = useState(substitui?.nome || '');
    const [emissao, setEmissao] = useState('');
    const [validade, setValidade] = useState('');
    const [confidencial, setConfidencial] = useState(Boolean(substitui?.confidencial));
    const [ficheiro, setFicheiro] = useState<File | null>(null);
    const [aGuardar, setAGuardar] = useState(false);
    const def = CATEGORIAS_DOCUMENTO.find(c => c.id === categoria)!;
    const categorias = CATEGORIAS_DOCUMENTO.filter(c => podeConfidencial || !CATEGORIAS_CONFIDENCIAIS.has(c.id));

    const guardar = async () => {
        setAGuardar(true);
        const ok = await executar(async () => {
            if (!ficheiro) throw new Error('Escolha o ficheiro.');
            await ServicoRH.carregarDocumento({
                funcionario_id: funcionarioId, categoria, nome, ficheiro_nome: ficheiro.name, data_url: await lerFicheiro(ficheiro),
                data_emissao: emissao || null, data_validade: validade || null, confidencial, substitui: substitui?.id || null,
            }, maxMb, actor);
        }, substitui ? 'Nova versão carregada (a anterior ficou como substituída)' : 'Documento carregado');
        setAGuardar(false);
        if (ok) { onSaved(); onClose(); }
    };

    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{substitui ? `Nova versão de «${substitui.nome}»` : 'Carregar documento'}</DialogTitle>
                    <DialogDescription>PDF, JPG, PNG ou DOCX até {maxMb} MB. O documento anterior não é apagado.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <Label className="text-xs font-bold">Categoria</Label>
                        <Select value={categoria} onValueChange={v => setCategoria(v as CategoriaDocumento)} disabled={Boolean(substitui)}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>{categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div><Label className="text-xs font-bold">Nome</Label><Input className="mt-1" value={nome} placeholder="Ex.: Bilhete de Identidade" onChange={e => setNome(e.target.value)} /></div>
                    <div><Label className="text-xs font-bold">Data de emissão</Label><Input className="mt-1" type="date" value={emissao} onChange={e => setEmissao(e.target.value)} /></div>
                    <div><Label className="text-xs font-bold">Data de validade {def.validade ? '' : '(opcional)'}</Label><Input className="mt-1" type="date" value={validade} onChange={e => setValidade(e.target.value)} /></div>
                    <div className="sm:col-span-2"><Label className="text-xs font-bold">Ficheiro</Label><Input className="mt-1" type="file" accept=".pdf,.png,.jpg,.jpeg,.docx" onChange={e => setFicheiro(e.target.files?.[0] || null)} /></div>
                    {!CATEGORIAS_CONFIDENCIAIS.has(categoria) && (
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-600 sm:col-span-2"><Switch checked={confidencial} onCheckedChange={setConfidencial} /> Marcar como confidencial</label>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={guardar} disabled={aGuardar}>{aGuardar ? 'A carregar…' : 'Carregar'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
