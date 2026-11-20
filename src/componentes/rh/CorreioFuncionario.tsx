import { useState } from 'react';
import { Inbox, Mail, MailOpen, Reply, Send } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { ServicoPortalComunicacao, type MensagemRH } from '@/servicos/rh/ServicoPortalComunicacao';
import { dataPt, executar, Vazio } from './comum-rh';

/**
 * Correio interno entre um funcionário e o RH. Do lado do funcionário escreve «para o RH»; do lado do RH escreve
 * «para o funcionário». As mensagens recebidas ficam por ler até serem abertas.
 */
export function CorreioInterno({ mensagens, lado, onEnviar, onMudou, vazio }: {
    mensagens: MensagemRH[];
    lado: 'funcionario' | 'rh';
    onEnviar: (assunto: string, corpo: string, respostaA: string | null) => Promise<boolean>;
    onMudou: () => void;
    vazio?: string;
}) {
    const [assunto, setAssunto] = useState('');
    const [corpo, setCorpo] = useState('');
    const [respostaA, setRespostaA] = useState<string | null>(null);
    const [aberta, setAberta] = useState<string | null>(null);
    const recebida = (m: MensagemRH) => (lado === 'funcionario' ? m.sentido === 'para_funcionario' : m.sentido === 'para_rh');
    const abrir = (m: MensagemRH) => {
        setAberta(aberta === m.id ? null : m.id);
        if (recebida(m) && !m.lida) void ServicoPortalComunicacao.marcarLida(m.id).then(onMudou);
    };
    const responder = (m: MensagemRH) => { setRespostaA(m.id); setAssunto(m.assunto.startsWith('Re: ') ? m.assunto : `Re: ${m.assunto}`); };
    const enviar = async () => {
        const ok = await onEnviar(assunto, corpo, respostaA);
        if (ok) { setAssunto(''); setCorpo(''); setRespostaA(null); onMudou(); }
    };
    return (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="mb-3 flex items-center gap-2 font-black"><Inbox className="h-4 w-4" /> Mensagens</h2>
                {mensagens.length === 0 ? <Vazio>{vazio || 'Sem mensagens.'}</Vazio> : mensagens.map(m => {
                    const porLer = recebida(m) && !m.lida;
                    return (
                        <div key={m.id} className={`mb-1.5 rounded-xl border px-3 py-2 text-sm ${porLer ? 'border-sky-300 bg-sky-50/70 dark:border-sky-800 dark:bg-sky-950/30' : 'border-slate-200 dark:border-slate-800'}`}>
                            <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => abrir(m)}>
                                {porLer ? <Mail className="h-4 w-4 shrink-0 text-sky-600" /> : <MailOpen className="h-4 w-4 shrink-0 text-slate-400" />}
                                <span className={`min-w-0 flex-1 truncate ${porLer ? 'font-black' : 'font-semibold'}`}>{m.assunto}</span>
                                <span className="shrink-0 text-xs text-slate-500">{recebida(m) ? `de ${m.de_nome || (lado === 'funcionario' ? 'RH' : 'funcionário')}` : 'enviada'} · {dataPt(m.criado_em)}</span>
                            </button>
                            {aberta === m.id && (
                                <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                                    <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{m.corpo}</p>
                                    {recebida(m) && <Button size="sm" variant="ghost" className="mt-1 h-7 px-2" onClick={() => responder(m)}><Reply className="mr-1 h-3.5 w-3.5" /> Responder</Button>}
                                </div>
                            )}
                        </div>
                    );
                })}
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="mb-3 flex items-center gap-2 font-black"><Send className="h-4 w-4" /> {respostaA ? 'Responder' : lado === 'funcionario' ? 'Escrever ao RH' : 'Escrever ao funcionário'}</h2>
                <Label className="text-xs font-bold">Assunto</Label>
                <Input className="mt-1" value={assunto} onChange={e => setAssunto(e.target.value)} />
                <Label className="mt-3 block text-xs font-bold">Mensagem</Label>
                <Textarea className="mt-1" rows={6} value={corpo} onChange={e => setCorpo(e.target.value)} />
                <div className="mt-3 flex gap-2">
                    <Button disabled={!assunto.trim() || corpo.trim().length < 2} onClick={() => void enviar()}><Send className="mr-1.5 h-4 w-4" /> Enviar</Button>
                    {respostaA && <Button variant="outline" onClick={() => { setRespostaA(null); setAssunto(''); }}>Nova mensagem</Button>}
                </div>
            </section>
        </div>
    );
}

export const enviarComAviso = (fazer: () => Promise<unknown>) => executar(fazer, 'Mensagem enviada');
