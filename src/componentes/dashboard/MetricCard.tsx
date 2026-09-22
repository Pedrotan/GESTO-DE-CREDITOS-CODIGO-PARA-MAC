import { ReactNode } from 'react';
import { cn } from '@/bibliotecas/utils';
import { TrendingUp, TrendingDown, Eye } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'purple';
  className?: string;
  onAction?: () => void;
  actionLabel?: string;
}

const variantStyles: Record<string, string> = {
  default: 'card-kpi-sky',
  primary: 'card-kpi-sky', // Pastel Sky Blue
  success: 'card-kpi-mint', // Pastel Mint Green
  warning: 'card-kpi-amber', // Pastel Warm Amber/Yellow
  danger: 'card-kpi-coral',  // Pastel Coral/Rose
  purple: 'card-kpi-purple',  // Pastel Lavender Pink
};

export function MetricCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  variant = 'default',
  className,
  onAction,
  actionLabel = 'Ver Detalhes',
}: MetricCardProps) {
  return (
    <div
      onClick={onAction}
      className={cn(
        variantStyles[variant] || variantStyles.default,
        onAction ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.99]' : '',
        className
      )}
    >
      {/* Linha Superior: Ícone Circular + Título + Botão de Olho/Trend */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
            {icon}
          </div>
          <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
            {title}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {trend && (
            <div className="flex items-center gap-1 text-xs font-bold text-slate-950 dark:text-white bg-black/10 dark:bg-white/10 px-2 py-0.5 rounded-full">
              {trend.isPositive ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              <span>{trend.isPositive ? '+' : ''}{trend.value}%</span>
            </div>
          )}

          {onAction && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAction();
              }}
              title={actionLabel}
              className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-950 dark:text-white transition-all hover:scale-110 active:scale-95 cursor-pointer shadow-2xs"
            >
              <Eye className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Linha Central: Valor em Destaque */}
      <div className="my-2">
        <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
          {value}
        </p>
      </div>

      {/* Linha Inferior: Subtítulo / Contexto */}
      {subtitle && (
        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
          {subtitle}
        </p>
      )}
    </div>
  );
}
