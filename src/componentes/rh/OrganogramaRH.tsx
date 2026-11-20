import { useMemo, useState } from 'react';
import { Building2, ChevronDown, ChevronRight, Crown, Network, UserRound, Users } from 'lucide-react';
import type { Cargo, Departamento, Funcionario, Seccao } from '@/servicos/rh/ServicoRH';
import { chefeDirecto, nomeNivel, organograma } from '@/bibliotecas/rh/hierarquia-rh';
import { cn } from '@/bibliotecas/utils';
import { Vazio } from './comum-rh';

const COR_NIVEL: Record<number, string> = {
    1: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200',
    2: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200',
    3: 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-200',
    4: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    5: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
};

/** Organograma: cada departamento com o responsável, as secções (com o chefe) e quem responde a quem. */
export function OrganogramaRH({ departamentos, seccoes, cargos, funcionarios }: { departamentos: Departamento[]; seccoes: Seccao[]; cargos: Cargo[]; funcionarios: Funcionario[] }) {
    const estrutura = useMemo(() => ({ departamentos, seccoes, cargos, funcionarios }), [departamentos, seccoes, cargos, funcionarios]);
    const arvore = useMemo(() => organograma(estrutura), [estrutura]);
    const [fechados, setFechados] = useState<Set<string>>(new Set());
    const nome = (id: string | null) => (id ? funcionarios.find(f => f.id === id)?.nome : undefined);
    const alternar = (id: string) => setFechados(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

    const Pessoa = ({ f, papel }: { f: Funcionario; papel?: string }) => {
        const cargo = cargos.find(c => c.id === f.cargo_id);
        const chefe = chefeDirecto(f, estrutura).id;
        return (
            <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900">
                {papel ? <Crown className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" /> : <UserRound className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
                <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{f.nome}</p>
                    <p className="truncate text-xs text-slate-500">{[papel, cargo?.nome].filter(Boolean).join(' · ') || 'Sem cargo'}{chefe && nome(chefe) ? ` · responde a ${nome(chefe)}` : ''}</p>
                </div>
                {cargo?.nivel ? <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', COR_NIVEL[cargo.nivel])}>{nomeNivel(cargo.nivel)}</span> : null}
            </div>
        );
    };

    if (arvore.length === 0) return <Vazio>Sem departamentos nem funcionários activos.</Vazio>;
    return (
        <div className="space-y-3">
            {arvore.map(bloco => {
                const chave = bloco.departamento?.id || 'sem-departamento';
                const aberto = !fechados.has(chave);
                return (
                    <section key={chave} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                        <button type="button" onClick={() => alternar(chave)} aria-expanded={aberto} className="flex w-full items-center gap-2 text-left">
                            {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <Building2 className="h-4 w-4 text-rh-navy dark:text-indigo-300" aria-hidden="true" />
                            <span className="flex-1 font-black">{bloco.departamento?.nome || 'Sem departamento'}</span>
                            <span className="flex items-center gap-1 text-xs text-slate-500"><Users className="h-3.5 w-3.5" /> {bloco.total}</span>
                        </button>
                        {aberto && (
                            <div className="mt-2 space-y-2">
                                {bloco.departamento && (bloco.responsavel
                                    ? <div className="max-w-md"><Pessoa f={bloco.responsavel as Funcionario} papel="Responsável do departamento" /></div>
                                    : <p className="text-xs text-amber-700 dark:text-amber-300">Sem responsável: indique-o em «Editar departamento».</p>)}
                                <div className="grid gap-2 border-l-2 border-slate-200 pl-3 md:grid-cols-2 dark:border-slate-700">
                                    {bloco.seccoes.map(s => (
                                        <div key={s.seccao?.id || 'sem'} className="space-y-1.5 rounded-xl border border-dashed border-slate-300 p-2 dark:border-slate-700">
                                            <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                                                <Network className="h-3.5 w-3.5" aria-hidden="true" /> {s.seccao ? `Secção ${s.seccao.nome}` : bloco.departamento ? 'Directamente no departamento' : 'Funcionários'}
                                            </p>
                                            {s.seccao && (s.responsavel ? <Pessoa f={s.responsavel as Funcionario} papel="Chefe da secção" /> : <p className="text-xs text-amber-700 dark:text-amber-300">Secção sem chefe.</p>)}
                                            <div className={cn('space-y-1.5', s.seccao && 'border-l border-slate-200 pl-2 dark:border-slate-700')}>
                                                {s.membros.length === 0 ? <p className="text-xs text-slate-500">Sem funcionários.</p> : s.membros.map(f => <Pessoa key={f.id} f={f as Funcionario} />)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>
                );
            })}
        </div>
    );
}
