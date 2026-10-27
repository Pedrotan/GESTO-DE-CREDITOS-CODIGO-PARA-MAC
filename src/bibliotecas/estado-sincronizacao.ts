// Estado do ícone de sincronização a partir de contagens reais deste dispositivo. «Sincronizado» só quando não há
// nada por enviar, nada retido, nada ilegível e nenhum conflito por ver; o que precisa de atenção fica «Verificar»,
// com a lista do que é (ao clicar no ícone).

export type SyncCounts = {
    /** Alterações deste dispositivo por enviar (sem as postas de parte por tamanho). */
    pending: number;
    /** Alterações deste dispositivo que não cabem no servidor, guardadas de parte. */
    oversized: number;
    /** Partes de transacções recebidas à espera do resto. */
    waiting: number;
    /** Alterações recebidas que não se conseguem decifrar (chave antiga). */
    unreadable: number;
    /** Alterações recebidas retidas por um conflito (NIF repetido, registo alterado nos dois lados…). */
    conflicts: number;
    /** Alterações recebidas retidas por serem de outra versão do sistema. */
    otherVersion: number;
    /** Utilizadores com o mesmo email e outro ID noutro dispositivo (criados em separado). */
    userClashes?: number;
    /** Verificação de integridade: tabelas com registos em falta (ou a mais) face aos outros dispositivos. */
    integrityMissing?: number;
    /** Tabelas com os mesmos registos mas conteúdo diferente (só assinalado). */
    integrityContent?: number;
    /** O servidor ainda tem mais para entregar. */
    hasMoreRemote?: boolean;
    /** Falha a publicar a identidade da empresa. */
    identityError?: string;
};

export type SyncIssueKind = 'conflicts' | 'otherVersion' | 'unreadable' | 'oversized' | 'userClashes' | 'integrityMissing' | 'integrityContent' | 'identity' | 'pending' | 'waiting';
export type SyncIssue = { kind: SyncIssueKind; count: number; title: string; detail: string; attention: boolean };

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export const syncIssues = (counts: SyncCounts): SyncIssue[] => {
    const issues: SyncIssue[] = [];
    if (counts.conflicts > 0) issues.push({
        kind: 'conflicts', count: counts.conflicts, attention: true,
        title: plural(counts.conflicts, 'conflito por ver', 'conflitos por ver'),
        detail: 'Alterações recebidas que não se aplicaram aqui (ex.: NIF repetido, registo alterado nos dois lados). O sistema volta a tentar e a autocura corrige o que puder.',
    });
    if (counts.otherVersion > 0) issues.push({
        kind: 'otherVersion', count: counts.otherVersion, attention: true,
        title: plural(counts.otherVersion, 'alteração de outra versão', 'alterações de outra versão'),
        detail: 'Feitas num computador com outra versão do sistema. Ficam guardadas e aplicam-se quando todos tiverem a mesma versão.',
    });
    if (counts.unreadable > 0) issues.push({
        kind: 'unreadable', count: counts.unreadable, attention: true,
        title: plural(counts.unreadable, 'alteração ilegível', 'alterações ilegíveis'),
        detail: 'Cifradas com um Código de Acesso anterior. Ficam guardadas e são lidas quando este dispositivo tiver a chave correcta.',
    });
    if (counts.oversized > 0) issues.push({
        kind: 'oversized', count: counts.oversized, attention: true,
        title: plural(counts.oversized, 'alteração grande demais', 'alterações grandes demais'),
        detail: 'Deste dispositivo, maiores do que o servidor aceita (ex.: documentos muito pesados). Estão guardadas aqui, sem se perderem.',
    });
    if (counts.userClashes) issues.push({
        kind: 'userClashes', count: counts.userClashes, attention: true,
        title: plural(counts.userClashes, 'utilizador com outro ID noutro computador', 'utilizadores com outro ID noutro computador'),
        detail: 'A mesma pessoa foi criada em separado em dois dispositivos. As mensagens do chat e o histórico de um não aparecem no outro até os unificar.',
    });
    if (counts.integrityMissing) issues.push({
        kind: 'integrityMissing', count: counts.integrityMissing, attention: true,
        title: plural(counts.integrityMissing, 'tabela com registos diferentes dos outros dispositivos', 'tabelas com registos diferentes dos outros dispositivos'),
        detail: 'A verificação de integridade encontrou registos em falta ou a mais. Os em falta são pedidos a outro dispositivo e entram sozinhos.',
    });
    if (counts.integrityContent) issues.push({
        kind: 'integrityContent', count: counts.integrityContent, attention: false,
        title: plural(counts.integrityContent, 'tabela com conteúdo diferente', 'tabelas com conteúdo diferente'),
        detail: 'Os mesmos registos com valores diferentes noutro dispositivo. Fica assinalado; as alterações retidas são corrigidas pela autocura.',
    });
    if (counts.identityError) issues.push({ kind: 'identity', count: 1, attention: true, title: 'Identidade da empresa por sincronizar', detail: counts.identityError });
    if (counts.pending > 0) issues.push({
        kind: 'pending', count: counts.pending, attention: false,
        title: plural(counts.pending, 'alteração por enviar', 'alterações por enviar'), detail: 'Seguem na próxima sincronização.',
    });
    if (counts.waiting > 0 || counts.hasMoreRemote) issues.push({
        kind: 'waiting', count: counts.waiting, attention: false,
        title: counts.waiting ? plural(counts.waiting, 'parte de transacção a chegar', 'partes de transacções a chegar') : 'Ainda há alterações por receber',
        detail: 'A receber o resto da nuvem.',
    });
    return issues;
};

/** «synced» só sem nada pendente nem retido; «attention» quando há algo para ver; «pending» quando só falta tempo. */
export const syncHealth = (counts: SyncCounts): 'synced' | 'pending' | 'attention' => {
    const issues = syncIssues(counts);
    if (issues.some(issue => issue.attention)) return 'attention';
    return issues.length ? 'pending' : 'synced';
};
