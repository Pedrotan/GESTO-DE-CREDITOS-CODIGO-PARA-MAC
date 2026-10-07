// Justificações das acções sensíveis (sobrepor risco, anular pagamento, estornar, reabrir período, alterar
// permissões). Rejeita textos curtos, sem palavras suficientes, com caracteres repetidos ou iguais a uma
// justificação anterior do mesmo utilizador.

export const JUSTIFICATION_MIN_CHARS = 20;
export const JUSTIFICATION_MIN_WORDS = 3;

const simplify = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Devolve a mensagem de erro, ou null quando a justificação é aceitável. */
export function validateJustification(text: string | null | undefined, previous: string[] = []): string | null {
    const value = String(text ?? '').trim().replace(/\s+/g, ' ');
    if (value.length < JUSTIFICATION_MIN_CHARS) return `A justificação tem de ter pelo menos ${JUSTIFICATION_MIN_CHARS} caracteres (tem ${value.length}).`;
    const words = value.split(' ').filter(word => (word.match(/[\p{L}\p{N}]/gu) || []).length >= 2);
    if (words.length < JUSTIFICATION_MIN_WORDS) return `A justificação tem de ter pelo menos ${JUSTIFICATION_MIN_WORDS} palavras.`;
    const compact = value.replace(/\s+/g, '').toLowerCase();
    if (/(.)\1{3,}/u.test(compact)) return 'A justificação não pode ter caracteres repetidos (ex.: «gggggggg»).';
    const letters = new Set(compact.replace(/[^\p{L}]/gu, ''));
    if (letters.size < 6) return 'A justificação não parece um texto com significado. Descreva o motivo concreto.';
    const distinctWords = new Set(words.map(simplify));
    if (distinctWords.size < JUSTIFICATION_MIN_WORDS) return 'A justificação repete as mesmas palavras. Descreva o motivo concreto.';
    const normalized = simplify(value);
    if (previous.some(item => item && simplify(item) === normalized)) return 'Esta justificação é igual a uma que já usou antes. Descreva o motivo concreto desta operação.';
    return null;
}

/** Lança erro quando a justificação não é válida (para os serviços). */
export function assertJustification(text: string | null | undefined, previous: string[] = []): string {
    const error = validateJustification(text, previous);
    if (error) throw new Error(error);
    return String(text).trim().replace(/\s+/g, ' ');
}

/** Justificações já usadas, a partir dos registos de auditoria (metadados e texto «Justificação:/Motivo:»). */
export function justificationsFromLogs(rows: Array<{ details?: string | null; metadata?: string | null }>): string[] {
    const found: string[] = [];
    for (const row of rows) {
        try {
            const meta = JSON.parse(row.metadata || '{}');
            for (const key of ['reason', 'justification', 'motivo', 'justificacao']) if (typeof meta?.[key] === 'string' && meta[key].trim()) found.push(meta[key]);
        } catch { /* metadados livres */ }
        const match = /(?:Justifica[cç][aã]o|Motivo)\s*:\s*(.+?)(?:\)|$)/iu.exec(String(row.details || ''));
        if (match?.[1]) found.push(match[1].trim());
    }
    return found;
}
