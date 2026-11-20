import type { ReactNode } from 'react';
import type { ClienteHub } from '@/bibliotecas/hub-cobranca';
import type { ServicoHubCobranca } from '@/servicos/ServicoHubCobranca';
export type EstadoHub = Awaited<ReturnType<typeof ServicoHubCobranca.carregar>>;
export type HubProps = { estado: EstadoHub; rows: ClienteHub[]; recarregar: () => Promise<void>; cloud: any; modelos: any[]; actualizarCloud: () => Promise<void> };
export const selectClass = 'w-full rounded-lg border bg-background px-3 py-2 text-sm';
export function Campo({ nome, children }: { nome: string; children: ReactNode }) { return <label className="grid gap-1.5 text-sm"><span className="font-medium">{nome}</span>{children}</label>; }
export function Metrica({ titulo, valor, nota, classe = '' }: { titulo: string; valor: ReactNode; nota?: string; classe?: string }) { return <div className={`rounded-2xl border bg-card p-4 ${classe}`}><p className="text-xs font-semibold text-muted-foreground">{titulo}</p><p className="mt-2 text-2xl font-black tabular-nums">{valor}</p>{nota && <p className="mt-1 text-xs text-muted-foreground">{nota}</p>}</div>; }
export function Vazio({ children }: { children: ReactNode }) { return <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</p>; }
export function Aviso({ children }: { children: ReactNode }) { return <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">{children}</p>; }
