import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, ChevronDown } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { activityHeatmap, byModuleAndSeverity, dailyEvolution, topUsers, type AuditEvent } from '@/bibliotecas/auditoria-analise';

const STORAGE_KEY = 'auditoria:graficos-abertos';
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const SEVERITY_COLORS = { critical: '#b91c1c', high: '#f97316', medium: '#eab308', low: '#38bdf8', info: '#94a3b8' };

function Panel({ title, subtitle, children, className, height = 'h-64' }: { title: string; subtitle?: string; children: React.ReactNode; className?: string; height?: string }) {
    return (
        <div className={cn('rounded-xl border bg-card p-4', className)}>
            <p className="text-sm font-bold">{title}</p>
            {subtitle && <p className="mb-2 text-xs text-muted-foreground">{subtitle}</p>}
            <div className={height}>{children}</div>
        </div>
    );
}

export function GraficosAuditoria({ events }: { events: AuditEvent[] }) {
    const [open, setOpen] = useState(() => { try { return localStorage.getItem(STORAGE_KEY) !== '0'; } catch { return true; } });
    const toggle = () => setOpen(value => { try { localStorage.setItem(STORAGE_KEY, value ? '0' : '1'); } catch { /* preferência local */ } return !value; });
    const heat = useMemo(() => activityHeatmap(events), [events]);
    const modules = useMemo(() => byModuleAndSeverity(events), [events]);
    const users = useMemo(() => topUsers(events), [events]);
    const daily = useMemo(() => dailyEvolution(events), [events]);
    const offHoursTotal = useMemo(() => events.filter(event => heat.offHours(event.weekday, event.hour)).length, [events, heat]);

    return (
        <div className="mb-6 rounded-xl border bg-muted/30">
            <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <span className="flex items-center gap-2 text-sm font-bold"><BarChart3 className="h-4 w-4 text-primary" /> Gráficos de atividade</span>
                <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
            </button>
            {open && (
                <div className="grid gap-4 px-4 pb-4 xl:grid-cols-2">
                    <Panel title="Mapa de calor: dia da semana × hora (hora de Angola)" subtitle={`Células com contorno vermelho = fora de horas (antes das 08:00, depois das 18:00 ou ao fim de semana) · ${offHoursTotal} evento(s) fora de horas`} className="xl:col-span-2" height="h-auto">
                        <div className="overflow-x-auto">
                            <div className="inline-grid min-w-full gap-[3px]" style={{ gridTemplateColumns: '44px repeat(24, minmax(22px, 1fr))' }}>
                                <span />
                                {Array.from({ length: 24 }, (_, hour) => <span key={hour} className="text-center text-[10px] text-muted-foreground">{String(hour).padStart(2, '0')}</span>)}
                                {[1, 2, 3, 4, 5, 6, 0].map(day => (
                                    <div key={day} className="contents">
                                        <span className="flex items-center text-[11px] font-semibold text-muted-foreground">{DAYS[day]}</span>
                                        {heat.grid[day].map((count, hour) => {
                                            const intensity = count / heat.max;
                                            const off = heat.offHours(day, hour);
                                            return (
                                                <span key={hour} title={`${DAYS[day]} ${String(hour).padStart(2, '0')}:00 – ${count} evento(s)${off ? ' · fora de horas' : ''}`}
                                                    className={cn('h-6 rounded-[4px] border', off && count ? 'border-red-500' : 'border-transparent')}
                                                    style={{ backgroundColor: count ? `rgba(${off ? '220,38,38' : '37,99,235'}, ${0.15 + intensity * 0.85})` : 'hsl(var(--muted))' }} />
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Panel>
                    <Panel title="Eventos por módulo e gravidade" subtitle="Barras empilhadas por gravidade">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={modules} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                                <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11 }} />
                                <Tooltip />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Bar dataKey="critical" name="Crítica" stackId="s" fill={SEVERITY_COLORS.critical} />
                                <Bar dataKey="high" name="Alta" stackId="s" fill={SEVERITY_COLORS.high} />
                                <Bar dataKey="medium" name="Média" stackId="s" fill={SEVERITY_COLORS.medium} />
                                <Bar dataKey="low" name="Baixa" stackId="s" fill={SEVERITY_COLORS.low} />
                                <Bar dataKey="info" name="Informativo" stackId="s" fill={SEVERITY_COLORS.info} radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </Panel>
                    <Panel title="Utilizadores mais ativos" subtitle="Total de eventos e eventos de gravidade alta ou crítica">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={users} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                                <YAxis type="category" dataKey="userName" width={140} tick={{ fontSize: 11 }} />
                                <Tooltip />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Bar dataKey="total" name="Eventos" fill="#2563eb" radius={[0, 4, 4, 0]} />
                                <Bar dataKey="high" name="Gravidade alta/crítica" fill={SEVERITY_COLORS.high} radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </Panel>
                    <Panel title="Evolução diária (últimos 30 dias)" subtitle="Barras: total de eventos · linha: gravidade alta e crítica" className="xl:col-span-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={8} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={36} />
                                <Tooltip />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Bar dataKey="total" name="Eventos" fill="#60a5fa" radius={[3, 3, 0, 0]} />
                                <Line type="monotone" dataKey="high" name="Altos e críticos" stroke={SEVERITY_COLORS.critical} strokeWidth={2} dot={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </Panel>
                </div>
            )}
        </div>
    );
}
