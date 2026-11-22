import { ArrowDown, ArrowUp, ArrowUpDown, Copy, ExternalLink, FileDown, FileText, Mail, MoreHorizontal, Pencil, Phone, Search, UserRound } from 'lucide-react';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/componentes/ui/dropdown-menu';
import { cn } from '@/bibliotecas/utils';
import { dataCurta, formatarTelefone, ligacaoTelefone, numeroWhatsApp, type LinhaContacto, type Ordenacao } from '@/bibliotecas/contactos/agenda-contactos';
import { Avatar, BadgeTipo, EdicaoRapida } from './comum-contactos';
import { btnIcone, btnWhatsApp, linkAccao } from './estilos-contactos';

export type AccoesLinha = {
    abrirFicha: (l: LinhaContacto) => void;
    copiar: (l: LinhaContacto) => void;
    exportar: (l: LinhaContacto, formato: 'pdf' | 'vcf') => void;
    editar: (l: LinhaContacto, campo: 'email' | 'address', valor: string) => Promise<boolean>;
    fichaCompleta: (l: LinhaContacto) => void;
};

const COLUNAS_ORDENAVEIS: Record<string, [Ordenacao, Ordenacao] | null> = {
    Cliente: ['nome_asc', 'nome_desc'], 'Cadastrado em': ['cadastro_desc', 'cadastro_asc'],
};

function BotoesAccao({ l, accoes, compacto }: { l: LinhaContacto; accoes: AccoesLinha; compacto?: boolean }) {
    const wa = numeroWhatsApp(l.telefone);
    return (
        <div className={cn('flex items-center gap-1.5', compacto ? '' : 'justify-end')}>
            {wa ? (
                <a className={cn(btnIcone, btnWhatsApp)} href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp de ${l.nome}`} title="WhatsApp">
                    <WhatsAppIcone />
                </a>
            ) : (
                <span className={cn(btnIcone, 'cursor-not-allowed opacity-40')} role="img" aria-label="Número inválido para WhatsApp" title="Número inválido para WhatsApp"><WhatsAppIcone /></span>
            )}
            {l.telefone ? <a className={btnIcone} href={ligacaoTelefone(l.telefone)} aria-label={`Ligar a ${l.nome}`} title="Ligar"><Phone className="h-4 w-4" /></a>
                : <span className={cn(btnIcone, 'opacity-40')} title="Sem telefone" role="img" aria-label="Sem telefone"><Phone className="h-4 w-4" /></span>}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button type="button" className={btnIcone} aria-label={`Mais acções para ${l.nome}`} title="Mais acções"><MoreHorizontal className="h-4 w-4" /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuItem onSelect={() => accoes.abrirFicha(l)}><UserRound className="mr-2 h-4 w-4" /> Ver ficha de contacto</DropdownMenuItem>
                    <DropdownMenuItem disabled={!l.email} onSelect={() => { window.location.href = `mailto:${l.email}`; }}><Mail className="mr-2 h-4 w-4" /> Enviar email</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => accoes.copiar(l)}><Copy className="mr-2 h-4 w-4" /> Copiar contacto</DropdownMenuItem>
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger><FileDown className="mr-2 h-4 w-4" /> Exportar este contacto</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                            <DropdownMenuItem onSelect={() => accoes.exportar(l, 'pdf')}><FileText className="mr-2 h-4 w-4" /> PDF</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => accoes.exportar(l, 'vcf')}><UserRound className="mr-2 h-4 w-4" /> vCard (.vcf)</DropdownMenuItem>
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => accoes.abrirFicha(l)}><Pencil className="mr-2 h-4 w-4" /> Editar contactos</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => accoes.fichaCompleta(l)}><ExternalLink className="mr-2 h-4 w-4" /> Ver ficha completa do cliente</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}

export function WhatsAppIcone() {
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M3 21l1.6-4.8A8.5 8.5 0 1 1 8 19.5L3 21Z" /></svg>;
}

export function TabelaContactos({
    linhas, aCarregar, porPagina, seleccionados, onSeleccionar, onSeleccionarPagina, ordenar, onOrdenar, nifs, podeEditar, accoes, onLimpar,
}: {
    linhas: LinhaContacto[]; aCarregar: boolean; porPagina: number; seleccionados: Set<string>;
    onSeleccionar: (id: string, v: boolean) => void; onSeleccionarPagina: (v: boolean) => void;
    ordenar: Ordenacao; onOrdenar: (o: Ordenacao) => void; nifs: Record<string, string>; podeEditar: boolean; accoes: AccoesLinha; onLimpar: () => void;
}) {
    const todosPagina = linhas.length > 0 && linhas.every(l => seleccionados.has(l.id));
    const algunsPagina = linhas.some(l => seleccionados.has(l.id));
    const cab = (rotulo: string, extra?: string) => {
        const par = COLUNAS_ORDENAVEIS[rotulo];
        if (!par) return <th scope="col" className={cn('whitespace-nowrap border-b border-[#E4E7EC] bg-[#F9FAFB] px-3.5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#475467] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400', extra)}>{rotulo}</th>;
        const activo = par.indexOf(ordenar);
        const Icone = activo === 0 ? (rotulo === 'Cliente' ? ArrowUp : ArrowDown) : activo === 1 ? (rotulo === 'Cliente' ? ArrowDown : ArrowUp) : ArrowUpDown;
        return (
            <th scope="col" aria-sort={activo === -1 ? 'none' : (rotulo === 'Cliente') === (activo === 0) ? 'ascending' : 'descending'}
                className={cn('whitespace-nowrap border-b border-[#E4E7EC] bg-[#F9FAFB] px-3.5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#475467] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400', extra)}>
                <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-[#101828] dark:hover:text-white" onClick={() => onOrdenar(activo === 0 ? par[1] : par[0])}>
                    {rotulo} <Icone className={cn('h-3.5 w-3.5', activo === -1 && 'opacity-40')} aria-hidden="true" />
                </button>
            </th>
        );
    };

    if (!aCarregar && linhas.length === 0) {
        return (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F2F4F7] text-[#667085] dark:bg-slate-800"><Search className="h-6 w-6" aria-hidden="true" /></span>
                <p className="text-base font-semibold text-[#101828] dark:text-slate-100">Nenhum cliente corresponde aos filtros</p>
                <button type="button" className={linkAccao} onClick={onLimpar}>Limpar filtros</button>
            </div>
        );
    }

    const celulaEmail = (l: LinhaContacto) => l.email
        ? <a href={`mailto:${l.email}`} className="text-sm text-[#0B6B43] hover:underline dark:text-emerald-400">{l.email}</a>
        : <EdicaoRapida rotulo="email" tipo="email" placeholder="nome@exemplo.ao" disabled={!podeEditar} onGuardar={v => accoes.editar(l, 'email', v)} />;
    const celulaMorada = (l: LinhaContacto) => l.morada
        ? <span className="block max-w-[260px] truncate" title={l.morada}>{l.morada}</span>
        : <EdicaoRapida rotulo="morada" placeholder="Ex.: Luanda - Samba, Rua 31 de Janeiro" disabled={!podeEditar} onGuardar={v => accoes.editar(l, 'address', v)} />;
    const nif = (l: LinhaContacto) => nifs[l.id] || l.nifMascarado || '—';

    return (
        <>
            {/* Ecrãs largos e médios: tabela (scroll horizontal dentro do cartão). */}
            <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1100px] border-collapse text-sm text-[#101828] dark:text-slate-100">
                    <thead>
                        <tr>
                            <th scope="col" className="w-10 border-b border-[#E4E7EC] bg-[#F9FAFB] px-3.5 py-3 dark:border-slate-800 dark:bg-slate-900">
                                <input type="checkbox" aria-label="Seleccionar os clientes desta página" checked={todosPagina}
                                    ref={el => { if (el) el.indeterminate = algunsPagina && !todosPagina; }} onChange={e => onSeleccionarPagina(e.target.checked)} />
                            </th>
                            {cab('Cliente')}{cab('NIF / BI')}{cab('Telefone')}{cab('Email')}{cab('Morada')}{cab('Cadastrado em')}{cab('Acções', 'text-right')}
                        </tr>
                    </thead>
                    <tbody>
                        {aCarregar && linhas.length === 0 ? Array.from({ length: Math.min(porPagina, 8) }, (_, i) => (
                            <tr key={i} aria-hidden="true">
                                {Array.from({ length: 8 }, (_, j) => <td key={j} className="border-b border-[#F2F4F7] px-3.5 py-3.5 dark:border-slate-800"><span className="block h-4 animate-pulse rounded bg-[#F2F4F7] dark:bg-slate-800" style={{ width: j === 0 ? 16 : j === 1 ? 180 : 110 }} /></td>)}
                            </tr>
                        )) : linhas.map(l => {
                            const sel = seleccionados.has(l.id);
                            return (
                                <tr key={l.id} className={cn('transition-colors', sel ? 'bg-[#F6FEF9] dark:bg-emerald-950/30' : 'hover:bg-[#F9FAFB] dark:hover:bg-slate-800/50', aCarregar && 'opacity-60')}>
                                    <td className="border-b border-[#F2F4F7] px-3.5 py-3 dark:border-slate-800"><input type="checkbox" aria-label={`Seleccionar ${l.nome}`} checked={sel} onChange={e => onSeleccionar(l.id, e.target.checked)} /></td>
                                    <td className="border-b border-[#F2F4F7] px-3.5 py-3 dark:border-slate-800">
                                        <button type="button" className="flex items-center gap-2.5 text-left" onClick={() => accoes.abrirFicha(l)}>
                                            <Avatar id={l.id} nome={l.nome} />
                                            <span><span className="block font-semibold hover:underline">{l.nome}</span><BadgeTipo tipo={l.tipo} /></span>
                                        </button>
                                    </td>
                                    <td className="whitespace-nowrap border-b border-[#F2F4F7] px-3.5 py-3 font-mono text-[13px] text-[#344054] dark:border-slate-800 dark:text-slate-300">{nif(l)}</td>
                                    <td className="whitespace-nowrap border-b border-[#F2F4F7] px-3.5 py-3 font-mono text-[13px] text-[#344054] dark:border-slate-800 dark:text-slate-300">{l.telefone ? formatarTelefone(l.telefone) : '—'}</td>
                                    <td className="border-b border-[#F2F4F7] px-3.5 py-3 dark:border-slate-800">{celulaEmail(l)}</td>
                                    <td className="border-b border-[#F2F4F7] px-3.5 py-3 dark:border-slate-800">{celulaMorada(l)}</td>
                                    <td className="whitespace-nowrap border-b border-[#F2F4F7] px-3.5 py-3 text-[#475467] dark:border-slate-800 dark:text-slate-400">{dataCurta(l.cadastradoEm) || 'Sem data'}</td>
                                    <td className="border-b border-[#F2F4F7] px-3.5 py-3 dark:border-slate-800"><BotoesAccao l={l} accoes={accoes} /></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {/* Telemóvel: um cartão por cliente (nome, telefone, acções). */}
            <ul className="divide-y divide-[#F2F4F7] md:hidden dark:divide-slate-800">
                {linhas.map(l => (
                    <li key={l.id} className={cn('flex flex-col gap-2 px-4 py-3', seleccionados.has(l.id) && 'bg-[#F6FEF9] dark:bg-emerald-950/30')}>
                        <div className="flex items-start gap-3">
                            <input type="checkbox" className="mt-3" aria-label={`Seleccionar ${l.nome}`} checked={seleccionados.has(l.id)} onChange={e => onSeleccionar(l.id, e.target.checked)} />
                            <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => accoes.abrirFicha(l)}>
                                <Avatar id={l.id} nome={l.nome} />
                                <span className="min-w-0"><span className="block truncate font-semibold text-[#101828] dark:text-slate-100">{l.nome}</span><BadgeTipo tipo={l.tipo} /></span>
                            </button>
                        </div>
                        <div className="flex items-center justify-between gap-2 pl-7">
                            <span className="font-mono text-[13px] text-[#344054] dark:text-slate-300">{l.telefone ? formatarTelefone(l.telefone) : 'Sem telefone'}</span>
                            <BotoesAccao l={l} accoes={accoes} compacto />
                        </div>
                    </li>
                ))}
            </ul>
        </>
    );
}
