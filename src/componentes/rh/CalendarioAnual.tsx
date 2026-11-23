// Calendário anual no estilo do calendário de parede: ano grande ao centro com linhas coloridas, 12 cartões de mês
// com contorno colorido (semana a começar ao domingo, domingos a vermelho), feriados, pontes, datas internacionais,
// o período de férias simulado, o regresso e as férias já marcadas. Modo «rh» (cores dos meses) e «portal» (meses a
// cinzento e só o mês escolhido a verde). Cada dia é um botão; as setas movem o foco e Enter escolhe.
import { useCallback, useRef, type KeyboardEvent } from 'react';
import type { DiaCalendario } from '@/bibliotecas/rh/calendario-laboral';
import { cn } from '@/bibliotecas/utils';

export const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
/** Cor do contorno de cada mês (como no modelo). */
export const CORES_MES = ['#E8A317', '#D9412B', '#4466AA', '#0E9F6E', '#0E9F6E', '#4466AA', '#E8A317', '#D9412B', '#D9412B', '#E8A317', '#0E9F6E', '#4466AA'];
const LINHAS_ANO = ['#E8A317', '#D9412B', '#4466AA', '#0E9F6E'];

export type PeriodoCalendario = {
    inicio: string; ultimoDia: string; regresso?: string | null;
    /** Dias do período: «u» dia útil de férias, «n» fim-de-semana ou feriado dentro do período. */
    dias?: Record<string, 'u' | 'n'>;
    /** Período em edição (simulado) ou já guardado (aprovado, previsto, pedido). */
    tipo: 'simulado' | 'aprovado' | 'previsto' | 'pendente';
    titulo?: string;
};

type Props = {
    ano: number;
    calendario: Map<string, DiaCalendario>;
    modo?: 'rh' | 'portal';
    hoje: string;
    periodos?: PeriodoCalendario[];
    /** Colegas de férias por dia (modo equipa): ponto por baixo do número. */
    equipa?: Map<string, number>;
    /** Dias acima do limite de ausências do departamento. */
    sobrecarga?: Set<string>;
    /** Mês destacado a verde no portal (0–11). */
    mesEscolhido?: number | null;
    onEscolher?: (data: string) => void;
    className?: string;
};

const pad = (n: number) => String(n).padStart(2, '0');
const chave = (ano: number, mes: number, dia: number) => `${ano}-${pad(mes + 1)}-${pad(dia)}`;

type EstadoDia = { classe: string; titulo: string; rotulo: string };

function estadoDoDia(data: string, semana: number, cal: Map<string, DiaCalendario>, p: Props): EstadoDia {
    const dia = cal.get(data);
    const portal = p.modo === 'portal';
    const partes: string[] = [];
    let classe = 'text-slate-800 dark:text-slate-200';
    if (semana === 0) classe = 'font-bold text-[#D92D20] dark:text-red-400';
    if (dia?.tipo === 'data_internacional') { classe = 'bg-[#E0EAFF] font-semibold text-[#2D47A8] dark:bg-indigo-950 dark:text-indigo-200'; partes.push(`${dia.nome} (data internacional)`); }
    else if (dia && dia.activo && dia.tipo === 'ponte') { classe = 'bg-[#FEF0C7] font-extrabold text-[#93370D] dark:bg-amber-950 dark:text-amber-200'; partes.push(dia.nome); }
    else if (dia && dia.activo && dia.folga) { classe = 'bg-[#FDE3E0] font-extrabold text-[#B42318] dark:bg-red-950 dark:text-red-200'; partes.push(`${dia.nome}${dia.internacional ? ' (internacional)' : ''}`); }
    else if (dia && !dia.activo) partes.push(`${dia.nome} (desactivado)`);
    let anel = data === p.hoje ? 'ring-2 ring-inset ring-[#4466AA]' : '';
    if (data === p.hoje) partes.push('Hoje');
    if (p.sobrecarga?.has(data)) { anel = 'ring-2 ring-inset ring-amber-500'; partes.push('Muitos colegas do departamento ausentes'); }
    for (const per of p.periodos || []) {
        const dentro = per.dias ? per.dias[data] : (data >= per.inicio && data <= per.ultimoDia ? (dia?.folga && dia.activo) || semana === 0 || semana === 6 ? 'n' : 'u' : undefined);
        if (dentro) {
            const pendente = per.tipo === 'pendente' || per.tipo === 'previsto';
            if (dentro === 'u') {
                classe = portal ? 'bg-[#067647] font-extrabold text-white' : pendente ? 'bg-[#86EFAC] font-extrabold text-[#05603A] dark:bg-emerald-700 dark:text-white' : 'bg-[#12B76A] font-extrabold text-white';
            } else classe = 'bg-[#D1FADF] font-bold text-[#05603A] dark:bg-emerald-950 dark:text-emerald-200';
            if (data === per.inicio || data === per.ultimoDia) anel = 'ring-2 ring-inset ring-[#054F31] dark:ring-emerald-300';
            partes.unshift(data === per.inicio ? 'Início das férias' : data === per.ultimoDia ? 'Último dia de férias' : per.titulo || 'Férias');
        }
        if (per.regresso && data === per.regresso) {
            classe = 'bg-white font-black text-[#0F1B3D] dark:bg-slate-100';
            anel = 'ring-2 ring-inset ring-[#0F1B3D]';
            partes.unshift('Regresso ao trabalho');
        }
    }
    return { classe: cn(classe, anel), titulo: partes.join(' · '), rotulo: partes.join(', ') };
}

function MesCartao({ mes, props, foco }: { mes: number; props: Props; foco: string }) {
    const { ano, calendario, modo } = props;
    const portal = modo === 'portal';
    const escolhido = portal && props.mesEscolhido === mes;
    const desloc = new Date(Date.UTC(ano, mes, 1)).getUTCDay();
    const total = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
    const temFerias = (props.periodos || []).some(p => p.inicio.slice(0, 7) <= chave(ano, mes, 1).slice(0, 7) && p.ultimoDia.slice(0, 7) >= chave(ano, mes, 1).slice(0, 7));
    const cor = portal ? (escolhido ? '#12B76A' : '#E4E7EC') : CORES_MES[mes];
    return (
        <section aria-label={`${MESES_PT[mes]} de ${ano}`}
            className={cn('overflow-hidden rounded-2xl bg-white dark:bg-slate-900', portal ? 'border-2' : 'border-[2.5px] p-3 pb-2.5',
                escolhido && 'bg-[#ECFDF3] shadow-[0_8px_24px_rgba(18,183,106,.18)] dark:bg-emerald-950/40', !portal && temFerias && 'bg-[#F6FEF9] dark:bg-emerald-950/20')}
            style={{ borderColor: cor }}>
            <div className={cn('flex items-center justify-center gap-2', portal ? (escolhido ? 'bg-[#12B76A] py-2 text-white' : 'border-b border-slate-100 py-2 text-slate-600 dark:border-slate-800 dark:text-slate-300') : 'border-b border-slate-200 pb-2 dark:border-slate-700')}>
                <h3 className="text-sm font-extrabold uppercase tracking-[0.14em]" style={portal ? undefined : { color: CORES_MES[mes] }}>{MESES_PT[mes]}</h3>
                {temFerias && <span className={cn('rounded-full px-1.5 text-[10px] font-bold', escolhido ? 'bg-white/25 text-white' : 'bg-[#D1FADF] text-[#05603A]')}>FÉRIAS</span>}
            </div>
            <div className={cn('grid grid-cols-7 gap-0.5', portal ? 'px-2.5 pt-2' : 'border-b border-slate-100 py-1.5 dark:border-slate-800')} aria-hidden="true">
                {SEMANA.map((d, i) => <span key={d} className={cn('text-center text-[10px] font-bold uppercase', i === 0 ? 'text-[#D92D20]' : 'text-slate-500')}>{d}</span>)}
            </div>
            <div className={cn('grid grid-cols-7 gap-0.5', portal ? 'px-2.5 pb-2.5 pt-1' : 'pt-1.5')}>
                {Array.from({ length: desloc }, (_, i) => <span key={`v${i}`} aria-hidden="true" />)}
                {Array.from({ length: total }, (_, i) => {
                    const data = chave(ano, mes, i + 1);
                    const semana = (desloc + i) % 7;
                    const e = estadoDoDia(data, semana, calendario, props);
                    const colegas = props.equipa?.get(data) || 0;
                    return (
                        <button key={data} type="button" data-dia={data} tabIndex={data === foco ? 0 : -1} title={e.titulo || undefined}
                            aria-label={`${i + 1} de ${MESES_PT[mes].toLowerCase()}${e.rotulo ? `, ${e.rotulo}` : ''}${colegas ? `, ${colegas} colega(s) de férias` : ''}`}
                            disabled={!props.onEscolher}
                            onClick={() => props.onEscolher?.(data)}
                            className={cn('relative flex h-[30px] w-full items-center justify-center rounded-lg text-[12.5px] tabular-nums transition-colors max-sm:h-11',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-default enabled:hover:brightness-95', e.classe)}>
                            {i + 1}
                            {colegas > 0 && <span aria-hidden="true" className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-violet-500" />}
                        </button>
                    );
                })}
            </div>
        </section>
    );
}

export function LegendaCalendario({ modo = 'rh' }: { modo?: 'rh' | 'portal' }) {
    const itens: Array<[string, string]> = modo === 'portal'
        ? [['bg-[#067647]', 'Os meus dias de férias'], ['bg-white ring-2 ring-inset ring-[#0F1B3D]', 'Regresso'], ['bg-[#FDE3E0]', 'Feriado'], ['bg-[#FEF0C7]', 'Ponte']]
        : [['bg-[#12B76A]', 'Férias (dia útil)'], ['bg-[#86EFAC]', 'Previsto / pedido'], ['bg-[#D1FADF]', 'Fim-de-semana/feriado no período'], ['bg-white ring-2 ring-inset ring-[#0F1B3D]', 'Regresso'],
            ['bg-[#FDE3E0]', 'Feriado nacional'], ['bg-[#FEF0C7]', 'Ponte'], ['bg-[#E0EAFF]', 'Data internacional (não é folga)'], ['bg-white ring-2 ring-inset ring-[#4466AA]', 'Hoje']];
    return (
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-medium text-slate-700 dark:text-slate-300" aria-label="Legenda">
            {itens.map(([c, t]) => <li key={t} className="flex items-center gap-1.5"><span aria-hidden="true" className={cn('h-4 w-4 rounded-[5px]', c)} />{t}</li>)}
        </ul>
    );
}

export function CalendarioAnual(props: Props) {
    const grelha = useRef<HTMLDivElement>(null);
    const portal = props.modo === 'portal';
    // Teclado: setas movem o foco entre os dias (±1 dia, ±1 semana), através dos meses.
    const teclado = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
        const passo = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key];
        const actual = (e.target as HTMLElement).dataset?.dia;
        if (!passo || !actual || !grelha.current) return;
        const d = new Date(`${actual}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() + passo);
        const alvo = grelha.current.querySelector<HTMLButtonElement>(`[data-dia="${d.toISOString().slice(0, 10)}"]`);
        if (alvo) { e.preventDefault(); alvo.focus(); }
    }, []);
    // O primeiro dia do período (ou hoje) recebe o foco do Tab.
    const simulado = props.periodos?.find(p => p.tipo === 'simulado')?.inicio;
    const foco = simulado?.startsWith(String(props.ano)) ? simulado : props.hoje.startsWith(String(props.ano)) ? props.hoje : `${props.ano}-01-01`;
    return (
        <div className={props.className}>
            <div className="mb-6 flex items-center gap-4 sm:gap-6">
                {[0, 1].map(lado => (
                    <div key={lado} aria-hidden="true" className={cn('flex flex-1 flex-col gap-1.5', lado === 1 && 'order-3')}>
                        {(portal ? ['#D0D5DD', '#12B76A', '#D0D5DD'] : LINHAS_ANO).map((c, i) => <span key={i} className="h-1 rounded-sm" style={{ background: c }} />)}
                    </div>
                ))}
                <h2 className="order-2 font-['Montserrat',Inter,system-ui,sans-serif] text-5xl font-black leading-none tracking-tight text-[#1B2645] dark:text-slate-100 sm:text-[76px]">{props.ano}</h2>
            </div>
            <div ref={grelha} onKeyDown={teclado} role="group" aria-label={`Calendário de ${props.ano}`}
                className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(232px,1fr))]">
                {MESES_PT.map((_, mes) => <MesCartao key={mes} mes={mes} props={props} foco={foco} />)}
            </div>
        </div>
    );
}
