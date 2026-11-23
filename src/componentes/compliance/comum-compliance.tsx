import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/bibliotecas/utils';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { useCarregar } from '@/componentes/rh/comum-rh';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';
import { avaliarKyc, ROTULO_ESTADO_KYC, type AvaliacaoKyc, type ClienteKyc, type EstadoKyc } from '@/bibliotecas/compliance/kyc';
import { detectarDuplicados, motivosDoCliente, type GrupoDuplicado } from '@/bibliotecas/compliance/duplicados';
import { ROTULO_NIVEL, type NivelRisco } from '@/bibliotecas/compliance/motor-risco';
import {
    DECISOES_ESCLARECIDAS, podeCompliance, ServicoCompliance,
    type ActorCompliance, type AvaliacaoRisco, type DadosCompliance, type PerfilCompliance,
} from '@/servicos/compliance/ServicoCompliance';
import type { Client } from '@/tipos/credito';
import { DADOS_SCREENING_VAZIOS, ServicoScreening, estadosPorCliente, type DadosScreening, type ScreeningRegisto } from '@/servicos/compliance/ServicoScreening';
import { ROTULO_ESTADO_SCREENING, type EstadoScreening, type PendenteScreening } from '@/bibliotecas/compliance/screening';

export const ABAS_COMPLIANCE = [
    { path: '/compliance/painel', label: 'Painel e clientes' },
    { path: '/compliance/screening', label: 'Screening PEP e sanções' },
    { path: '/compliance/duplicados', label: 'Possíveis duplicados' },
    { path: '/compliance/modelo-risco', label: 'Modelo de risco' },
];

export function NavegacaoCompliance() {
    const { pathname } = useLocation();
    const actual = pathname === '/compliance' || pathname.startsWith('/compliance/clientes') ? '/compliance/painel' : pathname;
    return (
        <nav aria-label="Módulo de Compliance" className="mb-5 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1.5 dark:border-slate-800 dark:bg-slate-900">
            {ABAS_COMPLIANCE.map(a => (
                <Link key={a.path} to={a.path} aria-current={actual === a.path ? 'page' : undefined}
                    className={cn('whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600',
                        actual === a.path ? 'bg-emerald-800 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}>
                    {a.label}
                </Link>
            ))}
        </nav>
    );
}

const COR_KYC: Record<EstadoKyc, string> = {
    verificado: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
    em_verificacao: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900',
    pendente: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700',
    incompleto: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
    expirado: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
    recusado: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
};
export function SeloKyc({ estado, className }: { estado: EstadoKyc; className?: string }) {
    return <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold', COR_KYC[estado], className)}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" />{ROTULO_ESTADO_KYC[estado]}
    </span>;
}

export const COR_NIVEL: Record<NivelRisco, string> = {
    baixo: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
    medio: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
    elevado: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
};
export const COR_BARRA_NIVEL: Record<NivelRisco, string> = { baixo: 'bg-emerald-500', medio: 'bg-amber-500', elevado: 'bg-red-500' };
export function SeloRisco({ nivel, pontuacao, className }: { nivel: NivelRisco | null | undefined; pontuacao?: number | null; className?: string }) {
    if (!nivel) return <span className={cn('inline-flex whitespace-nowrap rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-[11px] font-bold text-slate-500 dark:border-slate-700', className)}>Sem avaliação</span>;
    return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold', COR_NIVEL[nivel], className)}>
        {ROTULO_NIVEL[nivel]}{pontuacao !== null && pontuacao !== undefined && <span className="font-mono opacity-80">· {pontuacao}</span>}
    </span>;
}

const COR_SCREENING: Record<EstadoScreening, string> = {
    sem_correspondencia: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
    possivel: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
    confirmada: 'bg-red-600 text-white border-red-700',
    erro: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
    nao_verificado: 'bg-slate-50 text-slate-600 border-dashed border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700',
    desactualizado: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900',
};
export function SeloScreening({ estado, className }: { estado: EstadoScreening; className?: string }) {
    return <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold', COR_SCREENING[estado], className)}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" />{ROTULO_ESTADO_SCREENING[estado]}
    </span>;
}

export function useActorCompliance() {
    const { user } = useAuth();
    return useMemo(() => {
        const actor: ActorCompliance | null = user ? { id: user.id, name: user.name, role: user.role, permissions: user.permissions, isOwner: user.isOwner } : null;
        return {
            actor,
            ver: podeCompliance(actor, 'compliance_view'),
            registar: podeCompliance(actor, 'compliance_manage'),
            decidir: podeCompliance(actor, 'compliance_approve'),
            configurar: podeCompliance(actor, 'compliance_settings'),
            // Número completo do BI/NIF: a mesma permissão da agenda de contactos.
            sensiveis: !!user && ServicoControloAcesso.temPermissao(user, 'clients_reveal_id'),
        };
    }, [user]);
}

export type LinhaCompliance = {
    cliente: Client; perfil: PerfilCompliance | null; kyc: AvaliacaoKyc; avaliacao: AvaliacaoRisco | null;
    nivel: NivelRisco | null; duplicados: string[]; aRever: boolean; verificacaoPendente: boolean;
    screening: { estado: EstadoScreening; pendentes: PendenteScreening[]; pepConfirmado: boolean; sancaoConfirmada: boolean; ultimo: ScreeningRegisto | null };
};

/** Dados do módulo e as linhas por cliente (perfil, estado KYC, última avaliação, duplicados). */
export function useCompliance() {
    const { clients, credits } = useData();
    const carga = useCarregar<DadosCompliance & { scr: DadosScreening }>(async () => {
        const [base, scr] = await Promise.all([ServicoCompliance.carregar(), ServicoScreening.carregar()]);
        return { ...base, scr };
    }, { perfis: [], verificacoes: [], avaliacoes: [], modelos: [], revisoes: [], scr: DADOS_SCREENING_VAZIOS });
    const hoje = luandaTodayKey();
    const derivado = useMemo(() => {
        const { perfis, avaliacoes, revisoes, verificacoes } = carga.dados;
        const clientes = (clients || []).filter(c => !(c as { deletedAt?: unknown }).deletedAt);
        const perfilPor = new Map(perfis.map(p => [p.client_id, p]));
        const avaliacaoPor = new Map<string, AvaliacaoRisco>();
        for (const a of avaliacoes) if (!avaliacaoPor.has(a.client_id)) avaliacaoPor.set(a.client_id, a); // já vêm da mais recente
        const gruposPorRever: GrupoDuplicado[] = detectarDuplicados(clientes, revisoes);
        // Sinal de risco: só as conclusões «pessoas diferentes» deixam de contar.
        const gruposRisco = detectarDuplicados(clientes, revisoes.filter(r => DECISOES_ESCLARECIDAS.includes(r.decisao)));
        const pendentes = new Set(verificacoes.filter(v => v.estado === 'pendente').map(v => v.client_id));
        const screeningDe = estadosPorCliente(carga.dados.scr ?? DADOS_SCREENING_VAZIOS);
        const linhas: LinhaCompliance[] = clientes.map(c => {
            const perfil = perfilPor.get(c.id) || null;
            const avaliacao = avaliacaoPor.get(c.id) || null;
            return {
                cliente: c, perfil, avaliacao,
                kyc: avaliarKyc(c as unknown as ClienteKyc, perfil, hoje),
                nivel: (perfil?.nivel_risco as NivelRisco | null) || null,
                duplicados: motivosDoCliente(c.id, gruposRisco),
                aRever: !!avaliacao && avaliacao.requer_revisao === 1 && !avaliacao.revisto_por,
                verificacaoPendente: pendentes.has(c.id),
                screening: screeningDe(c.id),
            };
        });
        return { linhas, gruposPorRever, gruposRisco, clientes };
    }, [carga.dados, clients, hoje]);
    return { ...carga, ...derivado, creditos: credits || [], hoje };
}

export const dataHoraPt = (valor: string | null | undefined) => {
    if (!valor) return '—';
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return valor.slice(0, 10).split('-').reverse().join('/');
    return d.toLocaleString('pt-PT', { timeZone: 'Africa/Luanda', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
