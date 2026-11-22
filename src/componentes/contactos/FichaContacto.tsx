import { useEffect, useState } from 'react';
import { Calendar, Check, ChevronDown, ChevronUp, Copy, CreditCard, ExternalLink, Mail, MapPin, Phone, X } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/componentes/ui/sheet';
import { cn } from '@/bibliotecas/utils';
import { dataCurta, formatarTelefone, ligacaoMapa, ligacaoTelefone, numeroWhatsApp, type LinhaContacto } from '@/bibliotecas/contactos/agenda-contactos';
import { fichaTexto } from '@/bibliotecas/contactos/formatos-contactos';
import { Avatar, BadgeTipo, EdicaoRapida } from './comum-contactos';
import { btn, btnIcone, btnPrimario, btnWhatsApp, linkAccao } from './estilos-contactos';
import { WhatsAppIcone } from './TabelaContactos';

export type FichaDados = LinhaContacto & { observacoes: string };

function BotaoCopiar({ valor, rotulo, onCopiar }: { valor: string; rotulo: string; onCopiar: (texto: string, rotulo: string) => Promise<void> }) {
    const [ok, setOk] = useState(false);
    return (
        <button type="button" className={btnIcone} aria-label={`Copiar ${rotulo}`} title={`Copiar ${rotulo}`}
            onClick={async () => { await onCopiar(valor, rotulo); setOk(true); setTimeout(() => setOk(false), 1500); }}>
            {ok ? <Check className="h-4 w-4 text-[#067647]" /> : <Copy className="h-4 w-4" />}
        </button>
    );
}

export function FichaContacto({
    id, carregar, versao, temAnterior, temSeguinte, onAnterior, onSeguinte, onClose, podeEditar, podeRevelar,
    onRevelar, onEditar, onExportar, onCopiar, onFichaCompleta, nifRevelado,
}: {
    id: string | null; carregar: (id: string) => Promise<FichaDados | null>; versao: number;
    temAnterior: boolean; temSeguinte: boolean; onAnterior: () => void; onSeguinte: () => void; onClose: () => void;
    podeEditar: boolean; podeRevelar: boolean; nifRevelado?: string;
    onRevelar: (id: string) => void; onEditar: (l: LinhaContacto, campo: 'email' | 'address' | 'alternativePhone', valor: string) => Promise<boolean>;
    onExportar: (l: LinhaContacto, formato: 'pdf' | 'vcf') => void; onCopiar: (texto: string, rotulo: string) => Promise<void>; onFichaCompleta: (l: LinhaContacto) => void;
}) {
    const [ficha, setFicha] = useState<FichaDados | null>(null);
    useEffect(() => {
        let vivo = true;
        if (!id) { setFicha(null); return; }
        void carregar(id).then(f => { if (vivo) setFicha(f); }).catch(() => { if (vivo) setFicha(null); });
        return () => { vivo = false; };
    }, [id, carregar, versao]);

    // ↑/↓ passam ao cliente anterior/seguinte sem fechar; Esc fecha (tratado pelo Sheet).
    useEffect(() => {
        if (!id) return;
        const tecla = (e: KeyboardEvent) => {
            const alvo = e.target as HTMLElement | null;
            if (alvo && /^(INPUT|TEXTAREA|SELECT)$/u.test(alvo.tagName)) return;
            if (e.key === 'ArrowDown' && temSeguinte) { e.preventDefault(); onSeguinte(); }
            if (e.key === 'ArrowUp' && temAnterior) { e.preventDefault(); onAnterior(); }
        };
        window.addEventListener('keydown', tecla);
        return () => window.removeEventListener('keydown', tecla);
    }, [id, temAnterior, temSeguinte, onAnterior, onSeguinte]);

    const f = ficha && ficha.id === id ? ficha : null;
    const wa = f ? numeroWhatsApp(f.telefone) : null;
    const item = 'flex items-center gap-3 border-b border-[#F2F4F7] py-3.5 dark:border-slate-800';
    const icone = 'flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[#F2F4F7] text-[#344054] dark:bg-slate-800 dark:text-slate-300';
    const seccao = 'mb-1 mt-5 text-xs font-bold uppercase tracking-wider text-[#475467] dark:text-slate-400';

    return (
        <Sheet open={Boolean(id)} onOpenChange={v => { if (!v) onClose(); }}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px] [&>button]:hidden">
                {!f ? (
                    <div className="p-6 text-sm text-[#5B6474]" aria-live="polite"><SheetTitle className="sr-only">Ficha de contacto</SheetTitle><SheetDescription>A carregar a ficha…</SheetDescription></div>
                ) : (
                    <>
                        <div className="border-b border-[#E4E7EC] px-6 py-5 dark:border-slate-800">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3.5">
                                    <Avatar id={f.id} nome={f.nome} grande />
                                    <div className="min-w-0">
                                        <SheetTitle className="text-[19px] font-extrabold leading-tight text-[#101828] dark:text-white">{f.nome}</SheetTitle>
                                        <SheetDescription asChild>
                                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                <BadgeTipo tipo={f.tipo} />
                                                <span className="rounded-full bg-[#F2F4F7] px-2 py-px text-[11px] font-semibold text-[#344054] dark:bg-slate-800 dark:text-slate-300">{f.cadastradoEm ? `Cliente desde ${dataCurta(f.cadastradoEm)}` : 'Sem data de cadastro'}</span>
                                            </div>
                                        </SheetDescription>
                                    </div>
                                </div>
                                <div className="flex shrink-0 gap-1">
                                    <button type="button" className={btnIcone} aria-label="Cliente anterior (seta para cima)" title="Cliente anterior (↑)" disabled={!temAnterior} onClick={onAnterior}><ChevronUp className="h-4 w-4" /></button>
                                    <button type="button" className={btnIcone} aria-label="Cliente seguinte (seta para baixo)" title="Cliente seguinte (↓)" disabled={!temSeguinte} onClick={onSeguinte}><ChevronDown className="h-4 w-4" /></button>
                                    <button type="button" className={btnIcone} aria-label="Fechar" title="Fechar (Esc)" onClick={onClose}><X className="h-4 w-4" /></button>
                                </div>
                            </div>
                            <div className="mt-[18px] grid grid-cols-3 gap-2">
                                {wa ? <a className={cn(btn, btnWhatsApp)} href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"><WhatsAppIcone /> WhatsApp</a>
                                    : <span className={cn(btn, 'opacity-50')} title="Número inválido para WhatsApp"><WhatsAppIcone /> WhatsApp</span>}
                                {f.telefone ? <a className={btn} href={ligacaoTelefone(f.telefone)}><Phone className="h-4 w-4" /> Ligar</a> : <span className={cn(btn, 'opacity-50')}><Phone className="h-4 w-4" /> Ligar</span>}
                                {f.email ? <a className={btn} href={`mailto:${f.email}`}><Mail className="h-4 w-4" /> Email</a> : <span className={cn(btn, 'opacity-50')} title="Sem email"><Mail className="h-4 w-4" /> Email</span>}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 pb-5">
                            <p className={seccao}>Contactos</p>
                            <div className={item}>
                                <span className={icone}><Phone className="h-[18px] w-[18px]" /></span>
                                <div className="min-w-0 flex-1"><div className="text-xs text-[#5B6474]">Telefone principal</div><div className="font-mono text-sm font-semibold">{f.telefone ? formatarTelefone(f.telefone) : '—'}</div></div>
                                {f.telefone && <BotaoCopiar valor={formatarTelefone(f.telefone)} rotulo="telefone" onCopiar={onCopiar} />}
                            </div>
                            <div className={item}>
                                <span className={icone}><Mail className="h-[18px] w-[18px]" /></span>
                                <div className="min-w-0 flex-1"><div className="text-xs text-[#5B6474]">Email</div>
                                    {f.email ? <div className="truncate text-sm font-semibold">{f.email}</div> : <EdicaoRapida rotulo="email" tipo="email" placeholder="nome@exemplo.ao" disabled={!podeEditar} onGuardar={v => onEditar(f, 'email', v)} />}
                                </div>
                                {f.email && <BotaoCopiar valor={f.email} rotulo="email" onCopiar={onCopiar} />}
                            </div>
                            <div className={item}>
                                <span className={icone}><MapPin className="h-[18px] w-[18px]" /></span>
                                <div className="min-w-0 flex-1"><div className="text-xs text-[#5B6474]">Morada</div>
                                    {f.morada ? <div className="text-sm font-semibold">{f.morada}</div> : <EdicaoRapida rotulo="morada" placeholder="Ex.: Luanda - Samba, Rua 31 de Janeiro" disabled={!podeEditar} onGuardar={v => onEditar(f, 'address', v)} />}
                                    {(f.municipio || f.provincia) && <div className="text-xs text-[#5B6474]">{[f.municipio, f.provincia].filter(Boolean).join(', ')}</div>}
                                </div>
                                {f.morada && <a className={btnIcone} href={ligacaoMapa(f.morada)} target="_blank" rel="noreferrer" aria-label="Abrir no mapa" title="Abrir no mapa"><ExternalLink className="h-4 w-4" /></a>}
                            </div>
                            <div className={item}>
                                <span className={cn(icone, 'text-[#5B6474]')}><Phone className="h-[18px] w-[18px]" /></span>
                                <div className="min-w-0 flex-1"><div className="text-xs text-[#5B6474]">Telefone alternativo</div>
                                    {f.telefoneAlternativo ? <div className="font-mono text-sm font-semibold">{formatarTelefone(f.telefoneAlternativo)}</div>
                                        : <EdicaoRapida rotulo="telefone alternativo" tipo="tel" placeholder="9XX XXX XXX" disabled={!podeEditar} onGuardar={v => onEditar(f, 'alternativePhone', v)}>
                                            <button type="button" className={linkAccao} disabled={!podeEditar}>+ Adicionar</button>
                                        </EdicaoRapida>}
                                </div>
                                {f.telefoneAlternativo && <BotaoCopiar valor={formatarTelefone(f.telefoneAlternativo)} rotulo="telefone alternativo" onCopiar={onCopiar} />}
                            </div>

                            <p className={seccao}>Identificação</p>
                            <div className={item}>
                                <span className={icone}><CreditCard className="h-[18px] w-[18px]" /></span>
                                <div className="min-w-0 flex-1"><div className="text-xs text-[#5B6474]">NIF / BI</div><div className="font-mono text-sm font-semibold">{nifRevelado || f.nifMascarado || '—'}</div></div>
                                {f.nifMascarado && !nifRevelado && (podeRevelar
                                    ? <button type="button" className={linkAccao} onClick={() => onRevelar(f.id)}>Mostrar</button>
                                    : <span className="text-xs text-[#5B6474]" title="Revelar o NIF/BI exige a permissão «Clientes: Revelar NIF/BI»">Oculto</span>)}
                            </div>
                            <div className={cn(item, 'border-b-0')}>
                                <span className={icone}><Calendar className="h-[18px] w-[18px]" /></span>
                                <div className="min-w-0 flex-1"><div className="text-xs text-[#5B6474]">Cadastrado em</div>
                                    <div className="text-sm font-semibold">{f.cadastradoEm ? dataCurta(f.cadastradoEm) : 'Sem data'}{f.cadastradoPor ? ` · por ${f.cadastradoPor}` : ''}</div></div>
                            </div>
                            {f.observacoes && <><p className={seccao}>Observações</p><p className="whitespace-pre-line text-sm text-[#344054] dark:text-slate-300">{f.observacoes}</p></>}

                            <p className={seccao}>Exportar este contacto</p>
                            <div className="mt-2 grid grid-cols-3 gap-2">
                                <button type="button" className={btn} onClick={() => onExportar(f, 'pdf')}>PDF</button>
                                <button type="button" className={btn} onClick={() => onExportar(f, 'vcf')}>vCard</button>
                                <button type="button" className={btn} onClick={() => void onCopiar(fichaTexto(f), 'contacto')}>Copiar tudo</button>
                            </div>
                            <p className="mt-2.5 text-[13px] text-[#5B6474]">O vCard importa o cliente directamente para os contactos do telemóvel ou do Outlook.</p>
                        </div>

                        <div className="flex justify-between gap-2.5 border-t border-[#E4E7EC] px-6 py-3.5 dark:border-slate-800">
                            <button type="button" className={btn} onClick={() => onFichaCompleta(f)}>Ver ficha completa do cliente</button>
                            <button type="button" className={btnPrimario} disabled={!podeEditar} onClick={() => onFichaCompleta(f)} title="Abre a ficha do cliente para editar todos os contactos">Editar contactos</button>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
