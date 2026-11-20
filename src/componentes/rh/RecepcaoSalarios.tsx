import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { ServicoRecebimentoRH, ultimaPorRecibo, type RecebimentoRH } from '@/servicos/rh/ServicoRecebimentoRH';
import { dataPt, useCarregar } from './comum-rh';

/** Processamento pago: quem já confirmou a recepção do salário no portal, quem avisou que não recebeu e quem falta. */
export function RecepcaoSalarios({ processamentoId, recibos }: { processamentoId: string; recibos: Array<{ id: string; nome: string }> }) {
    const lista = useCarregar(() => ServicoRecebimentoRH.doProcessamento(processamentoId), [] as RecebimentoRH[], [processamentoId]);
    if (!recibos.length) return null;
    const ultima = ultimaPorRecibo(lista.dados);
    const recebidos = recibos.filter(r => ultima.get(r.id)?.estado === 'recebido');
    const naoRecebidos = recibos.filter(r => ultima.get(r.id)?.estado === 'nao_recebido');
    const emFalta = recibos.filter(r => !ultima.get(r.id));
    return (
        <div className={`rounded-2xl border p-3 text-sm ${naoRecebidos.length ? 'border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
            <h3 className="mb-1 text-xs font-black uppercase text-slate-600 dark:text-slate-300">Recepção do salário (confirmada no portal)</h3>
            <div className="flex flex-wrap gap-3 text-xs font-bold">
                <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> {recebidos.length} de {recibos.length} confirmaram</span>
                {naoRecebidos.length > 0 && <span className="flex items-center gap-1 text-red-600"><XCircle className="h-3.5 w-3.5" /> {naoRecebidos.length} não receberam</span>}
                {emFalta.length > 0 && <span className="flex items-center gap-1 text-slate-500"><Clock className="h-3.5 w-3.5" /> {emFalta.length} ainda sem resposta</span>}
            </div>
            {naoRecebidos.map(r => {
                const c = ultima.get(r.id)!;
                return <p key={r.id} className="mt-1.5 rounded-lg bg-white px-2 py-1 text-xs dark:bg-slate-900"><b>{r.nome}</b> ({dataPt(c.criado_em)}): {c.observacao}</p>;
            })}
            {emFalta.length > 0 && emFalta.length <= 12 && <p className="mt-1.5 text-xs text-slate-500">Sem resposta: {emFalta.map(r => r.nome).join(', ')}.</p>}
        </div>
    );
}
