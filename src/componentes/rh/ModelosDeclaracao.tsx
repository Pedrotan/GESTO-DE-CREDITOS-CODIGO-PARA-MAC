// Configurações › Modelos de declaração: lista, editor com variáveis e pré-visualização com dados de exemplo;
// também os modelos de relatório personalizado guardados (secções escolhidas).
import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Textarea } from '@/componentes/ui/textarea';
import { Switch } from '@/componentes/ui/switch';
import { Plus } from 'lucide-react';
import { ServicoModelosRH, type ModeloRH } from '@/servicos/rh/ServicoModelosRH';
import { aplicarModelo, MODELO_DECLARACAO_SERVICO, VARIAVEIS_MODELO, variaveisDesconhecidas } from '@/bibliotecas/rh/modelos-rh';
import type { ActorRH } from '@/servicos/rh/ServicoRH';
import { cn } from '@/bibliotecas/utils';
import { executar, useCarregar } from './comum-rh';
import { SECCOES_PERSONALIZADAS } from './relatorios-pessoais';

const exemplo = Object.fromEntries(VARIAVEIS_MODELO.map(v => [v.chave, v.exemplo]));

export function ModelosDeclaracao({ actor, podeEditar }: { actor: ActorRH | null; podeEditar: boolean }) {
    const modelos = useCarregar(() => ServicoModelosRH.modelos(), [] as ModeloRH[]);
    const [edicao, setEdicao] = useState<Partial<ModeloRH> | null>(null);
    const declaracoes = modelos.dados.filter(m => m.tipo === 'declaracao');
    const relatorios = modelos.dados.filter(m => m.tipo === 'relatorio');
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-extrabold text-rh-text dark:text-white">Modelos de declaração</h2>
                    <p className="mt-1 text-sm text-rh-muted dark:text-slate-400">Textos com variáveis como {'{{nome}}'}, {'{{bi}}'} ou {'{{salario_base}}'}, preenchidas com os dados do funcionário ao gerar.</p>
                </div>
                {podeEditar && <Button className="h-10 bg-rh-navy hover:bg-rh-navy-2" onClick={() => setEdicao({ tipo: 'declaracao', nome: '', titulo: '', conteudo: MODELO_DECLARACAO_SERVICO, activo: 1 })}><Plus className="mr-2 h-4 w-4" /> Novo modelo</Button>}
            </div>
            <div className="divide-y divide-slate-100 rounded-xl border border-rh-border bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {declaracoes.length === 0 ? <p className="p-6 text-center text-sm text-rh-muted">Sem modelos.</p> : declaracoes.map(m => (
                    <div key={m.id} className={cn('flex flex-wrap items-center justify-between gap-3 px-4 py-3', !m.activo && 'opacity-60')}>
                        <div className="min-w-0"><div className="font-semibold">{m.nome}{m.sistema ? <span className="ml-2 rounded bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500">inicial</span> : null}</div>
                            <div className="truncate text-xs text-rh-muted">{m.titulo || '—'} · {m.conteudo.slice(0, 110)}…</div></div>
                        {podeEditar && <button type="button" className="text-[13px] font-semibold text-rh-link hover:underline" onClick={() => setEdicao(m)}>Editar</button>}
                    </div>
                ))}
            </div>
            {relatorios.length > 0 && <>
                <h3 className="pt-2 text-base font-bold">Modelos de relatório personalizado</h3>
                <div className="divide-y divide-slate-100 rounded-xl border border-rh-border bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                    {relatorios.map(m => {
                        let seccoes: string[] = [];
                        try { seccoes = JSON.parse(m.conteudo).seccoes || []; } catch { /* ilegível */ }
                        return (
                            <div key={m.id} className={cn('flex flex-wrap items-center justify-between gap-3 px-4 py-3', !m.activo && 'opacity-60')}>
                                <div><div className="font-semibold">{m.nome}</div><div className="text-xs text-rh-muted">{seccoes.map(s => SECCOES_PERSONALIZADAS.find(x => x.id === s)?.nome || s).join(' · ')}</div></div>
                                {podeEditar && actor && <label className="flex items-center gap-2 text-xs font-semibold"><Switch checked={m.activo !== 0}
                                    onCheckedChange={v => void executar(() => ServicoModelosRH.guardar({ ...m, activo: v ? 1 : 0 }, actor), v ? 'Modelo activado' : 'Modelo desactivado').then(ok => ok && modelos.recarregar())} /> Activo</label>}
                            </div>
                        );
                    })}
                </div>
            </>}
            {actor && edicao && <EditorModelo inicial={edicao} actor={actor} onClose={() => setEdicao(null)} onSaved={() => void modelos.recarregar()} />}
        </div>
    );
}

function EditorModelo({ inicial, actor, onClose, onSaved }: { inicial: Partial<ModeloRH>; actor: ActorRH; onClose: () => void; onSaved: () => void }) {
    const [m, setM] = useState(inicial);
    const area = useRef<HTMLTextAreaElement>(null);
    const desconhecidas = variaveisDesconhecidas(m.conteudo || '');
    const inserir = (chave: string) => {
        const el = area.current;
        const texto = m.conteudo || '';
        const pos = el ? el.selectionStart : texto.length;
        const novo = `${texto.slice(0, pos)}{{${chave}}}${texto.slice(el ? el.selectionEnd : pos)}`;
        setM(x => ({ ...x, conteudo: novo }));
        setTimeout(() => { el?.focus(); el?.setSelectionRange(pos + chave.length + 4, pos + chave.length + 4); }, 0);
    };
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
                <DialogHeader><DialogTitle>{m.id ? `Editar «${inicial.nome}»` : 'Novo modelo de declaração'}</DialogTitle>
                    <DialogDescription>Clique numa variável para a inserir onde está o cursor. Um bloco {'{{#finalidade}}…{{/finalidade}}'} só aparece quando a variável tem valor.</DialogDescription></DialogHeader>
                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div><label htmlFor="md-nome" className="text-xs font-bold">Nome *</label><Input id="md-nome" className="mt-1" value={m.nome || ''} onChange={e => setM(x => ({ ...x, nome: e.target.value }))} /></div>
                            <div><label htmlFor="md-titulo" className="text-xs font-bold">Título no documento</label><Input id="md-titulo" className="mt-1" placeholder="DECLARAÇÃO DE SERVIÇO" value={m.titulo || ''} onChange={e => setM(x => ({ ...x, titulo: e.target.value }))} /></div>
                        </div>
                        <div><label htmlFor="md-texto" className="text-xs font-bold">Texto *</label>
                            <Textarea id="md-texto" ref={area} rows={14} className="mt-1 font-mono text-[13px]" value={m.conteudo || ''} onChange={e => setM(x => ({ ...x, conteudo: e.target.value }))} /></div>
                        {desconhecidas.length > 0 && <p role="alert" className="text-xs font-semibold text-red-600">Variáveis desconhecidas: {desconhecidas.map(v => `{{${v}}}`).join(', ')}</p>}
                        <div className="flex flex-wrap gap-1.5">
                            {VARIAVEIS_MODELO.map(v => <button key={v.chave} type="button" title={v.descricao} onClick={() => inserir(v.chave)} className="rounded-full border border-rh-border bg-white px-2.5 py-1 font-mono text-[11px] text-slate-700 hover:border-rh-link hover:text-rh-link dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{`{{${v.chave}}}`}</button>)}
                        </div>
                        {m.id && <label className="flex items-center gap-2 text-sm"><Switch checked={m.activo !== 0} onCheckedChange={v => setM(x => ({ ...x, activo: v ? 1 : 0 }))} /> Activo</label>}
                    </div>
                    <div>
                        <div className="text-xs font-bold">Pré-visualização (dados de exemplo)</div>
                        <div className="mt-1 rounded-xl border border-rh-border bg-white p-5 text-sm leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                            <div className="mb-3 text-center font-bold uppercase">{m.titulo || m.nome || 'Declaração'}</div>
                            {aplicarModelo(m.conteudo || '', exemplo).split(/\n{2,}/u).map((p, i) => <p key={i} className="mb-3 whitespace-pre-line text-justify">{p}</p>)}
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button className="bg-rh-navy hover:bg-rh-navy-2" disabled={desconhecidas.length > 0} onClick={() => void executar(() => ServicoModelosRH.guardar({ ...m, tipo: 'declaracao' }, actor), 'Modelo guardado').then(ok => { if (ok) { onSaved(); onClose(); } })}>Guardar modelo</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
