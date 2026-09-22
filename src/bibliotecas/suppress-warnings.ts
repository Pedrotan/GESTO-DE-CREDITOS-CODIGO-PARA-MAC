// Suppress verbose/annoying console output in development (must be imported at the very top of entry points)
const ignoredPatterns = [
    // Radix UI accessibility warnings
    "React Router Future Flag",
    "DialogContent requires a DialogTitle",
    "Missing `Description` or `aria-describedby={undefined}`",
    "Missing `Description` for [DialogContent]",
    "Missing 'Description' or 'aria-describedby={undefined}'",
    "Missing 'Description' for [DialogContent]",
    // React DevTools promo
    "Download the React DevTools",
    // Electron Security Warnings (shown only in dev, not in packaged app)
    "Electron Security Warning",
    // SQLite Adapter verbose logging
    "[SQLite Adapter]",
    "[SQLite]",
    "[Migration]",
    "[Dictionary]",
    // Sync / network noise
    "[Sincronização]",
    "[Sincronizaçao]",
    "[Notificação]",
    "[Notificaçao]",
    // Context/provider verbose init
    "[ContextoDados]",
    "[AuthProvider]",
    "[App]",
    // Auth session verbose
    "Tempo de sessão",
    "Sessão encerrada",
    "Modo Dev:",
    "Triggering initial data sync",
    "Remote user found",
    "User not found locally",
    "Forçando logout",
    "Initialization already in progress",
];

const originalLog = console.log;
console.log = (...args) => {
    const msg = args.join(" ");
    if (ignoredPatterns.some(p => msg.includes(p))) return;
    originalLog(...args);
};

const originalWarn = console.warn;
console.warn = (...args) => {
    const msg = args.join(" ");
    if (ignoredPatterns.some(p => msg.includes(p))) return;
    originalWarn(...args);
};

const originalError = console.error;
console.error = (...args) => {
    const msg = args.join(" ");
    if (ignoredPatterns.some(p => msg.includes(p))) return;
    originalError(...args);
};
