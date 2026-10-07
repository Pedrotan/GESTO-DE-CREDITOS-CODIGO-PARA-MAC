// Cores de cada nível da cadeia de aprovação (Gestor âmbar, Administrador azul, Diretor violeta, acima rosa).
export const LEVEL_STYLES = [
    { badge: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800', accent: 'border-l-amber-500' },
    { badge: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-800', accent: 'border-l-blue-600' },
    { badge: 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/40 dark:text-violet-200 dark:border-violet-800', accent: 'border-l-violet-600' },
    { badge: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-800', accent: 'border-l-rose-600' },
];
export const levelStyle = (index: number) => index < 0 ? { badge: 'bg-muted text-muted-foreground border-border', accent: 'border-l-transparent' } : LEVEL_STYLES[Math.min(index, LEVEL_STYLES.length - 1)];
