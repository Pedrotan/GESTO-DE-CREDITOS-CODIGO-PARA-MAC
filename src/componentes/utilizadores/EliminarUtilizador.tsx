import { useEffect, useState } from 'react';
import { AlertTriangle, FileDown, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Checkbox } from '@/componentes/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { ServicoEliminacaoUtilizador } from '@/servicos/ServicoEliminacaoUtilizador';
import { operacoesActivas, resumoUtilizador, type LevantamentoUtilizador } from '@/bibliotecas/relatorio-utilizador-eliminado';

const kz = (v: number) => `${(Number(v) || 0).toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;

/**
 * Eliminar um utilizador (só o Administrador principal): mostra antes as operações que ele tem em curso, avisa que
 * todas continuam no sistema, pede o motivo e, depois de eliminar, gera o relatório geral de tudo o que ele fez.
 */
export function EliminarUtilizador({ alvo, roleLabel, onClose, onConfirmar }: {
    alvo: { id: string; name: string; email?: string | null; role?: string | null; createdAt?: string | Date | null } | null;
    roleLabel?: string;
    onClose: () => void;
    onConfirmar: (levantamento: LevantamentoUtilizador, motivo: string) => Promise<void>;
}) {
    const [dados, setDados] = useState<LevantamentoUtilizador | null>(null);
    const [motivo, setMotivo] = useState('');
    const [compreendo, setCompreendo] = useState(false);
    const [aEliminar, setAEliminar] = useState(false);
    useEffect(() => {
        setDados(null); setMotivo(''); setCompreendo(false);
        if (alvo) void ServicoEliminacaoUtilizador.levantamento(alvo, roleLabel).then(setDados);
    }, [alvo, roleLabel]);
    const activas = dados ? operacoesActivas(dados) : null;
    const resumo = dados ? resumoUtilizador(dados) : null;
    const confirmar = async () => {
        if (!dados) return;
        setAEliminar(true);
        try { await onConfirmar(dados, motivo.trim()); } finally { setAEliminar(false); }
    };
    return (
        <Dialog open={Boolean(alvo)} onOpenChange={o => { if (!o && !aEliminar) onClose(); }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-700"><Trash2 className="h-5 w-5" /> Eliminar {alvo?.name}</DialogTitle>
                    <DialogDescription>O utilizador deixa de poder entrar. <b>Todas as operações dele continuam no sistema</b> (créditos, pagamentos, clientes, aprovações e auditoria).</DialogDescription>
                </DialogHeader>
                {!dados || !resumo || !activas ? (
                    <div className="flex items-center gap-2 py-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> A levantar as operações deste utilizador…</div>
                ) : (
                    <div className="space-y-3 text-sm">
                        {activas.total > 0 && (
                            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                                <p className="flex items-center gap-1.5 font-black"><AlertTriangle className="h-4 w-4" /> Este utilizador tem operações em curso</p>
                                <ul className="mt-1 list-disc pl-5">
                                    {activas.creditosActivos > 0 && <li>{activas.creditosActivos} crédito(s) activo(s) lançado(s) por ele, com {kz(activas.emDivida)} em dívida</li>}
                                    {activas.porAprovar > 0 && <li>{activas.porAprovar} crédito(s) à espera de aprovação</li>}
                                </ul>
                                <p className="mt-1 text-xs">Continuam no sistema e podem ser geridos por outro utilizador.</p>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            {([['Créditos lançados', String(resumo.creditos)], ['Pagos na totalidade', String(resumo.pagosNaTotalidade)],
                                ['Arrecadado dos seus créditos', kz(resumo.arrecadadoDaCarteira)], ['Clientes', String(resumo.clientes)],
                                ['Pagamentos que registou', kz(resumo.recebidoPeloUtilizador)], ['Registos de auditoria', String(resumo.registosAuditoria)]] as const).map(([t, v]) => (
                                <div key={t} className="rounded-lg border border-slate-200 px-2.5 py-1.5 dark:border-slate-800"><div className="text-[10px] font-bold uppercase text-slate-500">{t}</div><div className="font-black">{v}</div></div>
                            ))}
                        </div>
                        <p className="flex items-center gap-1.5 text-xs text-slate-500"><FileDown className="h-3.5 w-3.5" /> Depois de eliminar, é gerado o relatório geral de todas as operações dele (fica também guardado nos relatórios).</p>
                        <div>
                            <Label htmlFor="motivo-eliminar">Motivo da eliminação</Label>
                            <Textarea id="motivo-eliminar" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: saiu da empresa a 20/11/2026." />
                        </div>
                        <label className="flex items-start gap-2 text-xs">
                            <Checkbox checked={compreendo} onCheckedChange={v => setCompreendo(Boolean(v))} />
                            <span>Compreendo que {alvo?.name} deixa de ter acesso e que as operações dele ficam no sistema.</span>
                        </label>
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" disabled={aEliminar} onClick={onClose}>Cancelar</Button>
                    <Button variant="destructive" disabled={!dados || !compreendo || motivo.trim().length < 10 || aEliminar} onClick={() => void confirmar()}>
                        {aEliminar ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />} Eliminar e gerar relatório
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
