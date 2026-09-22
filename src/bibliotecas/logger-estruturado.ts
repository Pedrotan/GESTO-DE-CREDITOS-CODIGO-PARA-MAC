const SENSITIVE_KEY = /(password|passwd|token|secret|api.?key|authorization|cookie|nif|bi|iban|account|rescue)/iu;
const DOCUMENT_PATTERN = /\b\d{9}[A-Z]{2}\d{3}\b/gu;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+\/-]+=*/giu;

function redact(value: unknown, depth = 0): unknown {
    if (depth > 5) return '[TRUNCATED]';
    if (typeof value === 'string') return value.replace(BEARER_PATTERN, 'Bearer [REDACTED]').replace(DOCUMENT_PATTERN, '[DOCUMENT_REDACTED]');
    if (Array.isArray(value)) return value.slice(0, 100).map(item => redact(item, depth + 1));
    if (value && typeof value === 'object') {
        if (value instanceof Error) return { name: value.name, message: redact(value.message), stack: value.stack?.split('\n').slice(0, 8).join('\n') };
        return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) =>
            [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(item, depth + 1)]));
    }
    return value;
}

export function installStructuredConsole(service: string) {
    const marker = Symbol.for('tango.structured-console');
    const target = console as any;
    if (target[marker]) return;
    target[marker] = true;
    for (const level of ['debug', 'info', 'log', 'warn', 'error'] as const) {
        const original = console[level].bind(console);
        target[level] = (...args: unknown[]) => original(JSON.stringify({
            timestamp: new Date().toISOString(), level: level === 'log' ? 'info' : level,
            service, message: redact(args[0]), context: args.length > 1 ? redact(args.slice(1)) : undefined
        }));
    }
}
