import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { cn } from '@/bibliotecas/utils';
import { executar } from '@/componentes/rh/comum-rh';
import {
    PRAZO_DIAS, ROTULO_ESTADO_CASO, ROTULO_PRIORIDADE, ROTULO_TIPO_CASO, type EstadoCaso, type Prioridade, type TipoCaso,
} from '@/bibliotecas/compliance/casos';
import { ServicoCasos, type TipoLigacao } from '@/servicos/compliance/ServicoCasos';
import type { ActorCompliance } from '@/servicos/compliance/ServicoCompliance';

const COR_ESTADO: Record<EstadoCaso, string> = {
    aberto: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900',
    em_investigacao: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900',
    aguarda_decisao: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
    encerrado: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};
export function SeloCaso({ estado }: { estado: EstadoCaso }) {
    return <span className={cn('inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold', COR_ESTADO[estado])}>{ROTULO_ESTADO_CASO[estado]}</span>;
}
const COR_PRIORIDADE: Record<Prioridade, string> = { baixa: 'text-slate-500', media: 'text-amber-700 dark:text-amber-300', alta: 'text-red-600', critica: 'text-white bg-red-600 rounded px-1.5' };
export function SeloPrioridade({ prioridade }: { prioridade: Prioridade }) {
    return <span className={cn('whitespace-nowrap text-[11px] font-bold uppercase tracking-wide', COR_PRIORIDADE[prioridade])}>{ROTULO_PRIORIDADE[prioridade]}</span>;
}

export const AVISO_SIGILO = 'Confidencial: o cliente não pode ser informado da investigação nem de uma eventual comunicação à UIF (dever de segredo).';

/** Diálogo para abrir uma investigação (cliente fixo ou escolhido), já ligada aos registos indicados. */
export function DialogoNovoCaso({ cliente, clientes, ligacoes = [], tipoInicial = 'actividade_suspeita', prioridadeInicial = 'media', tituloInicial = '', actor, onClose, aoCriar }: {
    cliente?: { id: string; nome: string }; clientes?: Array<{ id: string; nome: string }>; ligacoes?: Array<{ tipo: TipoLigacao; refId: string; descricao: string }>;
    tipoInicial?: TipoCaso; prioridadeInicial?: Prioridade; tituloInicial?: string; actor: ActorCompliance; onClose: () => void; aoCriar?: (id: string) => void;
}) {
    const navigate = useNavigate();
    const [clienteId, setClienteId] = useState(cliente?.id || '');
    const [filtro, setFiltro] = useState('');
    const [tipo, setTipo] = useState<TipoCaso>(tipoInicial);
    const [prioridade, setPrioridade] = useState<Prioridade>(prioridadeInicial);
    const [titulo, setTitulo] = useState(tituloInicial);
    const [descricao, setDescricao] = useState('');
    const [aGuardar, setAGuardar] = useState(false);
    const nome = cliente?.nome || clientes?.find(c => c.id === clienteId)?.nome || '';
    const opcoes = (clientes || []).filter(c => !filtro.trim() || c.nome.toLowerCase().includes(filtro.trim().toLowerCase())).slice(0, 50);
    const guardar = async () => {
        setAGuardar(true);
        let novo: string | null = null;
        const ok = await executar(async () => {
            if (!clienteId) throw new Error('Escolha o cliente.');
            const r = await ServicoCasos.abrir({ clienteId, nomeCliente: nome, tipo, prioridade, titulo, descricao, ligacoes }, actor);
            novo = r.id;
        }, 'Investigação aberta');
        setAGuardar(false);
        if (ok && novo) { onClose(); if (aoCriar) aoCriar(novo); else navigate(`/compliance/casos/${novo}`); }
    };
    return (
        <Dialog open onOpenChange={x => !x && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Abrir investigação</DialogTitle>
                    <DialogDescription>{AVISO_SIGILO}</DialogDescription>
                </DialogHeader>
                {cliente ? <p className="text-sm">Cliente: <strong>{cliente.nome}</strong></p> : (
                    <div className="space-y-1">
                        <Label className="text-xs">Cliente</Label>
                        <Input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Pesquisar cliente" />
                        <Select value={clienteId || undefined} onValueChange={setClienteId}>
                            <SelectTrigger><SelectValue placeholder="Escolha o cliente" /></SelectTrigger>
                            <SelectContent>{opcoes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                )}
                {ligacoes.length > 0 && <p className="text-xs text-slate-500">Fica ligada a: {ligacoes.map(l => l.descricao).join(' · ')}</p>}
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1"><Label className="text-xs">Tipo</Label>
                        <Select value={tipo} onValueChange={v => setTipo(v as TipoCaso)}><SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{(Object.keys(ROTULO_TIPO_CASO) as TipoCaso[]).map(t => <SelectItem key={t} value={t}>{ROTULO_TIPO_CASO[t]}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-1"><Label className="text-xs">Prioridade (prazo)</Label>
                        <Select value={prioridade} onValueChange={v => setPrioridade(v as Prioridade)}><SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{(Object.keys(ROTULO_PRIORIDADE) as Prioridade[]).map(p => <SelectItem key={p} value={p}>{ROTULO_PRIORIDADE[p]} ({PRAZO_DIAS[p]} dias)</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Título</Label><Input value={titulo} onChange={e => setTitulo(e.target.value)} /></div>
                    <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Motivo e o que se vai analisar</Label><Textarea rows={4} value={descricao} onChange={e => setDescricao(e.target.value)} /></div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={guardar} disabled={aGuardar || !titulo.trim() || descricao.trim().length < 20 || !clienteId}>Abrir investigação</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Secção da ficha do cliente: investigações (em curso primeiro) e botão para abrir uma nova. */
export function InvestigacoesCliente({ cliente, casos, actor, podeAbrir }: {
    cliente: { id: string; nome: string }; casos: Array<{ id: string; numero: string; titulo: string; estado: EstadoCaso; prioridade: Prioridade; aberto_em: string }>;
    actor: ActorCompliance | null; podeAbrir: boolean;
}) {
    const [novo, setNovo] = useState(false);
    const ordenados = [...casos].sort((a, b) => Number(a.estado === 'encerrado') - Number(b.estado === 'encerrado') || b.aberto_em.localeCompare(a.aberto_em));
    return (
        <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div><h2 className="text-base font-bold">Investigações</h2><p className="text-[13px] text-slate-500 dark:text-slate-400">Confidencial: não revelar ao cliente.</p></div>
                {podeAbrir && actor && <Button size="sm" variant="outline" onClick={() => setNovo(true)}>Abrir investigação</Button>}
            </div>
            <div className="p-5">
                {!ordenados.length ? <p className="text-sm text-slate-500">Sem investigações.</p> : (
                    <ul className="space-y-2">
                        {ordenados.map(c => (
                            <li key={c.id}>
                                <Link to={`/compliance/casos/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 hover:border-slate-300 dark:border-slate-800">
                                    <span className="text-sm"><span className="font-mono text-xs text-slate-500">{c.numero}</span> · <strong>{c.titulo}</strong></span>
                                    <span className="flex items-center gap-2"><SeloPrioridade prioridade={c.prioridade} /><SeloCaso estado={c.estado} /></span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {novo && actor && <DialogoNovoCaso cliente={cliente} actor={actor} onClose={() => setNovo(false)} />}
        </section>
    );
}
