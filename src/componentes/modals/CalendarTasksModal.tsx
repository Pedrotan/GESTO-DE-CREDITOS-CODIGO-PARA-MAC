import { useEffect, useState } from 'react';
import {
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    addMonths,
    subMonths,
    isSameMonth,
    isSameDay,
    isToday,
    format,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Trash2, CalendarClock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Textarea } from '@/componentes/ui/textarea';
import { cn } from '@/bibliotecas/utils';
import { CalendarTask } from '@/tipos/credito';

const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

interface CalendarTasksModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialYear: number;
    initialMonth: number; // 0-based
    tasks: CalendarTask[];
    onAddTask: (task: { title: string; description?: string; date: string }) => Promise<void> | void;
    onDeleteTask: (id: string) => Promise<void> | void;
}

export function CalendarTasksModal({
    open,
    onOpenChange,
    initialYear,
    initialMonth,
    tasks,
    onAddTask,
    onDeleteTask,
}: CalendarTasksModalProps) {
    const [viewDate, setViewDate] = useState(new Date(initialYear, initialMonth, 1));
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (open) {
            const today = new Date();
            const isCurrentMonthInView = today.getFullYear() === initialYear && today.getMonth() === initialMonth;
            setViewDate(new Date(initialYear, initialMonth, 1));
            setSelectedDate(isCurrentMonthInView ? today : new Date(initialYear, initialMonth, 1));
            setNewTitle('');
            setNewDescription('');
        }
    }, [open, initialYear, initialMonth]);

    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(viewDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

    const tasksByDay = (day: Date) => {
        const key = format(day, 'yyyy-MM-dd');
        return tasks.filter(t => t.date === key);
    };

    const selectedDateKey = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
    const selectedDayTasks = selectedDateKey ? tasks.filter(t => t.date === selectedDateKey) : [];

    const handleAddTask = async () => {
        if (!selectedDate || !newTitle.trim() || isSaving) return;
        setIsSaving(true);
        try {
            await onAddTask({
                title: newTitle.trim(),
                description: newDescription.trim() || undefined,
                date: format(selectedDate, 'yyyy-MM-dd'),
            });
            setNewTitle('');
            setNewDescription('');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        <CalendarClock className="h-5 w-5" />
                        Agenda de Tarefas
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5">
                    {/* Navegação do mês */}
                    <div className="flex items-center justify-between">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-full"
                            onClick={() => setViewDate(prev => subMonths(prev, 1))}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm font-bold capitalize text-foreground">
                            {format(viewDate, 'MMMM yyyy', { locale: ptBR })}
                        </span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-full"
                            onClick={() => setViewDate(prev => addMonths(prev, 1))}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Cabeçalho dos dias da semana */}
                    <div className="grid grid-cols-7 gap-1 text-center">
                        {WEEKDAY_LABELS.map(label => (
                            <span key={label} className="text-[11px] font-semibold text-muted-foreground">
                                {label}
                            </span>
                        ))}
                    </div>

                    {/* Grelha de dias */}
                    <div className="grid grid-cols-7 gap-1">
                        {days.map(day => {
                            const dayTasks = tasksByDay(day);
                            const inMonth = isSameMonth(day, viewDate);
                            const selected = selectedDate ? isSameDay(day, selectedDate) : false;
                            const today = isToday(day);

                            return (
                                <button
                                    key={day.toISOString()}
                                    type="button"
                                    onClick={() => setSelectedDate(day)}
                                    className={cn(
                                        "relative flex flex-col items-center justify-center h-10 rounded-full text-sm font-semibold transition-colors",
                                        !inMonth && "text-muted-foreground/30",
                                        inMonth && !selected && "text-foreground hover:bg-muted",
                                        selected && "bg-primary text-primary-foreground",
                                        !selected && today && "ring-2 ring-primary/60"
                                    )}
                                >
                                    {format(day, 'd')}
                                    {dayTasks.length > 0 && (
                                        <span className={cn(
                                            "absolute bottom-1 h-1 w-1 rounded-full",
                                            selected ? "bg-primary-foreground" : "bg-amber-500"
                                        )} />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Tarefas do dia selecionado */}
                    {selectedDate && (
                        <div className="space-y-3 border-t pt-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                {format(selectedDate, "d 'de' MMMM", { locale: ptBR })}
                            </p>

                            {selectedDayTasks.length > 0 && (
                                <div className="space-y-2 max-h-32 overflow-y-auto">
                                    {selectedDayTasks.map(task => (
                                        <div
                                            key={task.id}
                                            className="flex items-start justify-between gap-2 rounded-lg border bg-muted/30 p-2.5"
                                        >
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-foreground truncate">{task.title}</p>
                                                {task.description && (
                                                    <p className="text-xs text-muted-foreground truncate">{task.description}</p>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => onDeleteTask(task.id)}
                                                className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                                                title="Remover tarefa"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="space-y-2">
                                <Input
                                    placeholder="Título da tarefa ou ação..."
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    className="h-9 text-sm"
                                />
                                <Textarea
                                    placeholder="Descrição (opcional)"
                                    value={newDescription}
                                    onChange={(e) => setNewDescription(e.target.value)}
                                    className="text-sm min-h-[60px]"
                                />
                                <Button
                                    className="w-full gap-1.5"
                                    size="sm"
                                    disabled={!newTitle.trim() || isSaving}
                                    onClick={handleAddTask}
                                >
                                    <Plus className="h-4 w-4" />
                                    Agendar Tarefa
                                </Button>
                            </div>
                        </div>
                    )}

                    <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
                        Concluído
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
