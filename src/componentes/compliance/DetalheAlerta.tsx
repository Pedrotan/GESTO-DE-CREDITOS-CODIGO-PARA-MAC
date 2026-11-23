import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/componentes/ui/button';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { executar } from '@/componentes/rh/comum-rh';
import { SeloAlerta, SeloGravidade, dataHoraPt } from './comum-compliance';
import { REGRAS_MONITORIZACAO, ROTULO_CATEGORIA_ALERTA, ROTULO_ESTADO_ALERTA, TRANSICOES, type EstadoAlerta } from '@/bibliotecas/compliance/monitorizacao';
import { ServicoMonitorizacao, type AlertaRegisto, type HistoricoAlerta } from '@/servicos/compliance/ServicoMonitorizacao';
import { podeCompliance, type ActorCompliance } from '@/servicos/compliance/ServicoCompliance';
import { DialogoNovoCaso } from './casos-comum';
import { prioridadeSugerida, type TipoCaso } from '@/bibliotecas/compliance/casos';

const ACCAO: Record<EstadoAlerta, string> = {
    NEW: '', IN_REVIEW: 'Iniciar / retomar análise', INFORMATION_REQUESTED: 'Pedir informação', SUBSTANTIATED: 'Concluir: fundamentado',
    NOT_SUBSTANTIATED: 'Concluir: não confirmado', CLOSED: 'Encerrar',
};

/** Valor das evidências em texto legível (montantes em Kz, listas e objectos simples). */
function valor(v: unknown): string {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'number') return v.toLocaleString('pt-PT');
    if (Array.isArray(v)) return v.map(x => (typeof x === 'object' && x ? Object.values(x).map(y => valor(y)).join(' · ') : valor(x))).join(' | ');
    if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${valor(x)}`).join(', ');
    return String(v);
}

export function DetalheAlerta({ alerta: a, historico, nomeCliente, actor, onClose, aoMudar, casos = [] }: {
    alerta: AlertaRegisto; historico: HistoricoAlerta[]; nomeCliente: string | null; actor: ActorCompliance | null; onClose: () => void; aoMudar: () => void;
    /** Investigações a que o alerta já está ligado. */
    casos?: Array<{ id: string; numero: string }>;
}) {
    const [novoCaso, setNovoCaso] = useState(false);
    const [texto, setTexto] = useState('');
    const [aGuardar, setAGuardar] = useState(false);
    const evidencias = (() => { try { return JSON.parse(a.evidencias) as Record<string, unknown>; } catch { return {}; } })();
    const proximos = TRANSICOES[a.estado];
    const pode = (para: EstadoAlerta) => !!actor && podeCompliance(actor, ['SUBSTANTIATED', 'NOT_SUBSTANTIATED', 'CLOSED'].includes(para) ? 'compliance_approve' : 'compliance_manage');
    const mudar = async (para: EstadoAlerta) => {
        if (!actor) return;
        setAGuardar(true);
        const ok = await executar(() => ServicoMonitorizacao.mudarEstado(a, para, { comentario: texto, conclusao: texto, medidas: texto }, actor), `Alerta: ${ROTULO_ESTADO_ALERTA[para]}`);
        setAGuardar(false);
        if (ok) { setTexto(''); aoMudar(); if (para === 'CLOSED') onClose(); }
    };
    const comentar = async () => {
        if (!actor) return;
        setAGuardar(true);
        const ok = await executar(() => ServicoMonitorizacao.comentar(a, texto, actor), 'Comentário registado');
        setAGuardar(false);
        if (ok) { setTexto(''); aoMudar(); }
    };
    const ajuda = a.estado === 'IN_REVIEW' || a.estado === 'INFORMATION_REQUESTED'
        ? 'Para pedir informação escreva o que foi pedido e a quem; para concluir, o fundamento (o que foi analisado e porquê).'
        : a.estado === 'SUBSTANTIATED' ? 'Para encerrar, indique as medidas tomadas (diligência reforçada, bloqueio, investigação…). A comunicação à UIF trata-se em separado.'
        : a.estado === 'NOT_SUBSTANTIATED' ? 'Pode encerrar; as medidas são opcionais.' : '';
    return (
        <Dialog open onOpenChange={x => !x && onClose()}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="pr-6">{a.titulo}</DialogTitle>
                    <DialogDescription>{REGRAS_MONITORIZACAO[a.regra]?.descricao}</DialogDescription>
                </DialogHeader>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                    <SeloAlerta estado={a.estado} /><SeloGravidade gravidade={a.gravidade} />
                    <span className="text-slate-500">{ROTULO_CATEGORIA_ALERTA[a.categoria]} · detectado em {dataHoraPt(a.detectado_em)}{a.modelo_versao ? ` · regras v${a.modelo_versao}` : ''}</span>
                </div>
                <p className="text-sm">{a.descricao}</p>
                <div className="flex flex-wrap gap-3 text-xs">
                    {a.client_id && <Link to={`/compliance/clientes/${a.client_id}`} className="font-semibold text-emerald-700 underline dark:text-emerald-400" onClick={onClose}>Ficha de Compliance{nomeCliente ? ` de ${nomeCliente}` : ''}</Link>}
                    {a.operacao_id && <span className="text-slate-500">Registo original: {a.operacao_tabela} <span className="font-mono">{a.operacao_id}</span></span>}
                    {casos.map(c => <Link key={c.id} to={`/compliance/casos/${c.id}`} onClick={onClose} className="font-semibold text-violet-700 underline dark:text-violet-300">Investigação {c.numero}</Link>)}
                    {a.client_id && actor && podeCompliance(actor, 'compliance_manage') && a.estado !== 'CLOSED' && !casos.length && (
                        <button type="button" onClick={() => setNovoCaso(true)} className="font-semibold text-violet-700 underline dark:text-violet-300">Abrir investigação</button>
                    )}
                </div>
                {novoCaso && actor && a.client_id && (
                    <DialogoNovoCaso cliente={{ id: a.client_id, nome: nomeCliente || 'Cliente' }} actor={actor} onClose={() => setNovoCaso(false)}
                        tipoInicial={(a.categoria === 'fraude' ? 'fraude' : a.regra === 'desembolso_sem_controlos' ? 'kyc' : 'actividade_suspeita') as TipoCaso}
                        prioridadeInicial={prioridadeSugerida([a.gravidade])} tituloInicial={a.titulo}
                        ligacoes={[{ tipo: 'alerta', refId: a.id, descricao: a.titulo }]} />
                )}
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Evidências</p>
                    <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[160px_1fr]">
                        {Object.entries(evidencias).map(([k, v]) => <div key={k} className="contents"><dt className="text-slate-500">{k}</dt><dd className="break-words">{valor(v)}</dd></div>)}
                    </dl>
                </div>
                {a.responsavel_nome && <p className="text-xs text-slate-600 dark:text-slate-400">Responsável pela análise: <strong>{a.responsavel_nome}</strong></p>}
                {a.conclusao && <p className="rounded-lg border border-slate-200 p-2.5 text-xs dark:border-slate-700"><strong>{a.resultado ? ROTULO_ESTADO_ALERTA[a.resultado] : 'Conclusão'}</strong> por {a.concluido_por_nome}, {dataHoraPt(a.concluido_em)}: {a.conclusao}</p>}
                {a.medidas && a.estado === 'CLOSED' && <p className="rounded-lg border border-slate-200 p-2.5 text-xs dark:border-slate-700"><strong>Encerrado</strong> por {a.encerrado_por_nome}, {dataHoraPt(a.encerrado_em)}: {a.medidas}</p>}

                {a.estado !== 'CLOSED' && actor && podeCompliance(actor, 'compliance_manage') && (
                    <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                        <Label className="text-xs">Comentário, pedido, fundamento ou medidas</Label>
                        <Textarea rows={3} value={texto} onChange={e => setTexto(e.target.value)} />
                        {ajuda && <p className="text-[11px] text-slate-500">{ajuda}</p>}
                        <div className="flex flex-wrap gap-2">
                            {proximos.filter(pode).map(para => (
                                <Button key={para} size="sm" disabled={aGuardar} variant={para === 'SUBSTANTIATED' ? 'destructive' : para === 'IN_REVIEW' || para === 'CLOSED' ? 'default' : 'outline'} onClick={() => mudar(para)}>{ACCAO[para]}</Button>
                            ))}
                            <Button size="sm" variant="ghost" disabled={aGuardar || !texto.trim()} onClick={comentar}>Só comentar</Button>
                        </div>
                        {proximos.some(p => !pode(p)) && <p className="text-[11px] text-slate-500">Concluir e encerrar exigem a permissão «Compliance: Decidir».</p>}
                    </div>
                )}

                <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Histórico</p>
                    {!historico.length ? <p className="text-xs text-slate-500">Sem movimentos.</p> : (
                        <ol className="space-y-1 text-xs">
                            {historico.map(h => (
                                <li key={h.id} className="border-l-2 border-slate-200 pl-2 dark:border-slate-700">
                                    <span className="text-slate-500">{dataHoraPt(h.em)} · {h.por_nome}</span> — {h.estado_anterior === h.estado_novo ? 'comentário' : `${ROTULO_ESTADO_ALERTA[h.estado_anterior as EstadoAlerta] || 'Novo'} → ${ROTULO_ESTADO_ALERTA[h.estado_novo as EstadoAlerta]}`}
                                    {h.comentario && <span className="block text-slate-700 dark:text-slate-300">{h.comentario}</span>}
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
