import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/componentes/ui/table';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useToast } from '@/componentes/ui/use-toast';
import { cn } from '@/bibliotecas/utils';
import { exportTableExcel, exportTablePdf, type ExportTable } from './exportar';


export function SeccaoCabecalho({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
    return (
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
                <h2 className="text-lg font-bold tracking-tight text-foreground">{title}</h2>
                {description && <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

export function BotoesExportar({ build, disabled }: { build: () => ExportTable; disabled?: boolean }) {
    const { companySettings } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
    const run = async (kind: 'pdf' | 'excel') => {
        try {
            const table = build();
            if (!table.body.length) { toast({ title: 'Sem dados', description: 'Não há registos para exportar com estes filtros.' }); return; }
            if (kind === 'pdf') exportTablePdf(table, companySettings, user?.name);
            else await exportTableExcel(table);
        } catch (error: any) {
            toast({ title: 'Exportação falhou', description: error?.message || 'Não foi possível exportar.', variant: 'destructive' });
        }
    };
    return (
        <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2" disabled={disabled} onClick={() => void run('pdf')}><FileText className="h-4 w-4" /> PDF</Button>
            <Button variant="outline" size="sm" className="gap-2" disabled={disabled} onClick={() => void run('excel')}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
        </div>
    );
}

export type Coluna<T> = {
    key: string;
    header: ReactNode;
    align?: 'left' | 'right' | 'center';
    className?: string;
    render: (row: T) => ReactNode;
};

/** Tabela com paginação simples, usada em todos os livros e listas da contabilidade. */
export function TabelaPaginada<T>({ columns, rows, rowKey, pageSize = 25, empty = 'Sem registos para os filtros seleccionados.', footer, rowClassName }: {
    columns: Coluna<T>[]; rows: T[]; rowKey: (row: T) => string; pageSize?: number; empty?: string;
    footer?: ReactNode; rowClassName?: (row: T) => string | undefined;
}) {
    const [page, setPage] = useState(1);
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    useEffect(() => { if (page > pages) setPage(1); }, [page, pages]);
    const visible = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize]);
    const align = (value?: string) => value === 'right' ? 'text-right' : value === 'center' ? 'text-center' : 'text-left';
    return (
        <div className="overflow-hidden rounded-xl border bg-card">
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            {columns.map(column => <TableHead key={column.key} className={cn('whitespace-nowrap text-xs font-bold uppercase tracking-wide', align(column.align), column.className)}>{column.header}</TableHead>)}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {visible.length === 0 ? (
                            <TableRow><TableCell colSpan={columns.length} className="py-10 text-center text-sm text-muted-foreground">{empty}</TableCell></TableRow>
                        ) : visible.map(row => (
                            <TableRow key={rowKey(row)} className={rowClassName?.(row)}>
                                {columns.map(column => <TableCell key={column.key} className={cn('align-top text-sm', align(column.align), column.className)}>{column.render(row)}</TableCell>)}
                            </TableRow>
                        ))}
                    </TableBody>
                    {footer && <TableFooter>{footer}</TableFooter>}
                </Table>
            </div>
            {rows.length > pageSize && (
                <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
                    <span>{(page - 1) * pageSize + 1}–{Math.min(rows.length, page * pageSize)} de {rows.length}</span>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
                        <span className="px-2 font-semibold">{page} / {pages}</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Página seguinte"><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                </div>
            )}
        </div>
    );
}

export function Indicador({ label, value, hint, tone = 'default' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'good' | 'bad' | 'warn' }) {
    const tones = {
        default: 'border-border',
        good: 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30',
        bad: 'border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30',
        warn: 'border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30',
    };
    return (
        <div className={cn('rounded-xl border p-3', tones[tone])}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-lg font-black tracking-tight text-foreground">{value}</p>
            {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
    );
}

export function AvisoErro({ message }: { message?: string }) {
    if (!message) return null;
    return <p role="alert" className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{message}</p>;
}
