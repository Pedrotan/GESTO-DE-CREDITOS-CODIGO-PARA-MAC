// Verificação de integridade da sincronização. Cada dispositivo resume cada tabela em 16 grupos de registos (pelo ID):
// quantos registos, uma impressão dos IDs e uma impressão do conteúdo de cada grupo. Os resumos não revelam dados (são
// hashes) e o servidor compara-os entre os dispositivos da empresa: o resumo da maioria é a referência. Um grupo com
// IDs diferentes quer dizer registos em falta (ou a mais) e é reparado pela cópia completa dos registos desse grupo,
// enviada pelo dispositivo de referência (os em falta entram sozinhos); conteúdo diferente com os mesmos IDs só é
// assinalado — nunca se sobrescreve às cegas.

export const INTEGRITY_BUCKETS = 16;

/** FNV-1a de 32 bits: rápido e igual em todos os dispositivos (não é segurança, só comparação). */
export const fnv1a = (text: string) => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
};

export const bucketOf = (id: string) => fnv1a(String(id)) % INTEGRITY_BUCKETS;

/**
 * Impressão do conteúdo de um registo, igual em versões diferentes do sistema: colunas por ordem, sem os campos vazios
 * (uma coluna nova ainda vazia num dispositivo antigo não conta como diferença) e com números normalizados.
 */
export const rowContentHash = (row: Record<string, unknown>) => {
    const entries = Object.keys(row).sort()
        .filter(column => row[column] !== null && row[column] !== undefined && row[column] !== '')
        .map(column => {
            const value = row[column];
            const text = typeof value === 'number' ? String(Number(value)) : typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
            return `${column}=${text}`;
        });
    return fnv1a(entries.join('\u0001')).toString(16).padStart(8, '0');
};

export type BucketDigest = { count: number; ids: string; content: string };
export type TableDigest = { count: number; buckets: BucketDigest[] };

const short = (values: string[]) => fnv1a(values.join(',')).toString(16).padStart(8, '0') + fnv1a(values.reverse().join(';')).toString(16).padStart(8, '0');

/** Resumo de uma tabela a partir dos seus registos (cada um com `id`). */
export const tableDigest = (rows: Array<Record<string, unknown>>): TableDigest => {
    const groups = Array.from({ length: INTEGRITY_BUCKETS }, () => [] as Array<[string, string]>);
    for (const row of rows) {
        const id = String(row.id ?? '');
        if (!id) continue;
        groups[bucketOf(id)].push([id, rowContentHash(row)]);
    }
    return {
        count: groups.reduce((total, group) => total + group.length, 0),
        buckets: groups.map(group => {
            const sorted = group.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
            return { count: sorted.length, ids: short(sorted.map(([id]) => id)), content: short(sorted.map(([id, hash]) => `${id}:${hash}`)) };
        }),
    };
};

export type IntegrityReport = { at: string; tables: Record<string, TableDigest> };

/** Grupos de uma tabela em que os IDs diferem da referência (registos em falta ou a mais). */
export const differingIdBuckets = (mine: TableDigest | undefined, reference: TableDigest | undefined) => {
    if (!reference) return [] as number[];
    return reference.buckets.map((bucket, index) => (mine?.buckets[index]?.ids === bucket.ids ? -1 : index)).filter(index => index >= 0);
};

/** Grupos com os mesmos IDs mas conteúdo diferente (só assinalados). */
export const differingContentBuckets = (mine: TableDigest | undefined, reference: TableDigest | undefined) => {
    if (!mine || !reference) return [] as number[];
    return reference.buckets.map((bucket, index) => (mine.buckets[index]?.ids === bucket.ids && mine.buckets[index]?.content !== bucket.content ? index : -1))
        .filter(index => index >= 0);
};
