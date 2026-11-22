import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Eye, FileWarning, Loader2, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Textarea } from '@/componentes/ui/textarea';
import { Label } from '@/componentes/ui/label';
import { PdfCanvasViewer } from '@/componentes/ui/PdfCanvasViewer';
import { cn } from '@/bibliotecas/utils';
import { ServicoRH, type ActorRH, type Funcionario } from '@/servicos/rh/ServicoRH';
import { ServicoPortalComunicacao, type MensagemRH } from '@/servicos/rh/ServicoPortalComunicacao';
import { folhaDaMensagem, ServicoEnvioFolha, type FolhaRecebida } from '@/servicos/rh/ServicoEnvioFolha';
import { executar } from './comum-rh';

/**
 * Folha de correcção enviada pelo RH, no painel do portal: aviso a vermelho enquanto não for vista, visualização da
 * folha completa (só para ver: sem descarregar nem imprimir) e reclamação justificada ao RH e à administração.
 */
export function FolhaCorreccaoPortal({ f, actor, correio, destinatarios, onMudou }: {
    f: Funcionario; actor: ActorRH; correio: MensagemRH[]; destinatarios: string[]; onMudou: () => void;
}) {
    const folhas = useMemo(() => correio.filter(m => m.sentido === 'para_funcionario').map(folhaDaMensagem).filter((x): x is FolhaRecebida => Boolean(x))
        .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)), [correio]);
    const [aberta, setAberta] = useState<FolhaRecebida | null>(null);
    const [pdf, setPdf] = useState<string | null>(null);
    const [erro, setErro] = useState('');
    const [motivo, setMotivo] = useState('');
    const [aEnviar, setAEnviar] = useState(false);

    useEffect(() => {
        if (!aberta) { setPdf(null); setErro(''); setMotivo(''); return; }
        let vivo = true;
        void ServicoRH.ficheiroDocumento(aberta.documentoId)
            .then(dados => { if (vivo) { if (dados) setPdf(dados); else setErro('A folha ainda não chegou a este dispositivo. Tente daqui a pouco.'); } })
            .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : String(e)); });
        if (!aberta.lida) void ServicoPortalComunicacao.marcarLida(aberta.mensagemId).then(onMudou);
        return () => { vivo = false; };
    }, [aberta]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!folhas.length) return null;
    const porVer = folhas.filter(x => !x.lida);
    const destaque = porVer[0] || folhas[0];

    return (
        <>
            <div role={porVer.length ? 'alert' : undefined} className={cn('mb-4 flex flex-wrap items-center gap-3 rounded-2xl border p-4',
                porVer.length ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900')}>
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', porVer.length ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800')}>
                    <FileWarning className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="font-black">{porVer.length ? `Nova ${destaque.assunto.charAt(0).toLowerCase()}${destaque.assunto.slice(1)}` : destaque.assunto}</p>
                    <p className="text-sm opacity-80">{porVer.length ? 'O RH enviou a folha para conferir. Veja-a e, se houver um erro, faça a reclamação.' : 'Já viu esta folha. Pode voltar a vê-la ou reclamar.'}</p>
                </div>
                <Button className={porVer.length ? 'bg-red-600 text-white hover:bg-red-700' : ''} variant={porVer.length ? 'default' : 'outline'} onClick={() => setAberta(destaque)}>
                    <Eye className="mr-1.5 h-4 w-4" /> Ver folha
                </Button>
            </div>

            <Dialog open={Boolean(aberta)} onOpenChange={v => { if (!v && !aEnviar) setAberta(null); }}>
                <DialogContent className="flex h-[94vh] max-w-6xl flex-col gap-3 p-4 sm:p-6">
                    <DialogHeader>
                        <DialogTitle>{aberta?.assunto}</DialogTitle>
                        <DialogDescription>Só para ver: a folha não pode ser descarregada nem impressa.</DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-slate-100 dark:bg-slate-950" onContextMenu={e => e.preventDefault()}>
                        {erro ? <p className="flex items-center gap-2 p-6 text-sm text-red-700"><AlertTriangle className="h-4 w-4" /> {erro}</p>
                            : pdf ? <PdfCanvasViewer source={pdf} className="h-full select-none" />
                                : <p className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> A abrir a folha…</p>}
                    </div>
                    <form className="space-y-2 rounded-xl border border-orange-200 bg-orange-50/60 p-3 dark:border-orange-900 dark:bg-orange-950/30"
                        onSubmit={async e => {
                            e.preventDefault();
                            if (!aberta) return;
                            setAEnviar(true);
                            const ok = await executar(() => ServicoEnvioFolha.reclamar(f, aberta, motivo, actor, destinatarios), 'Reclamação enviada ao RH');
                            setAEnviar(false);
                            if (ok) { setMotivo(''); onMudou(); }
                        }}>
                        <Label htmlFor="reclamacao-folha" className="text-xs font-bold">Reclamar desta folha (justifique o erro encontrado)</Label>
                        <Textarea id="reclamacao-folha" rows={3} value={motivo} maxLength={1500} onChange={e => setMotivo(e.target.value)}
                            placeholder="Ex.: as faltas de 12/11 foram justificadas com atestado; o desconto de faltas não devia aparecer." />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs text-slate-500">A reclamação vai para o Gestor de RH e para o Super Administrador.</span>
                            <Button type="submit" disabled={aEnviar || motivo.trim().length < 10} className="bg-orange-500 text-white hover:bg-orange-600">
                                <Send className="mr-1.5 h-4 w-4" /> {aEnviar ? 'A enviar…' : 'Enviar reclamação'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
