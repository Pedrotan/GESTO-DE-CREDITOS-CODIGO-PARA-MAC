// Manutenção automática depois de cada sincronização: clientes repetidos (fusao-clientes.ts), alterações de clientes
// arquivadas quando o NIF/telefone ainda eram únicos, e conflitos que já não têm efeito. Tudo calculado a partir da
// própria base. Na versão web corre no navegador; no computador corre no processo principal (como as alterações
// recebidas da nuvem): não depende das permissões de quem tem a sessão aberta, por isso nunca é uma «acção sem
// permissão» nem gera alertas de segurança.
import { clientesEnvolvidos, planoReconciliacaoClientes, type ClienteParaFusao, type ReferenciaCliente, type TabelaReferencia } from './fusao-clientes.ts';
import { CONFLICT_RESOLVE_SQL, statementRowId } from './sync-operacoes.ts';

export type ComandoManutencao = { sql: string; params?: unknown[] };
export type DepsManutencao = {
    all: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
    transaction: (statements: ComandoManutencao[]) => Promise<unknown>;
    /** SQL dos comandos sincronizados (para identificar o registo de uma alteração retida). */
    sqlById: Map<string, string>;
    /** Registo apagado definitivamente (lápides da versão web); o computador usa a ficha em falta. */
    tombstoned?: (table: string, id: string) => boolean;
};
export type ResultadoManutencao = { reactivados: number; restaurados: number; fundidos: number; religados: number; resolvidos: number; alertasLimpos: number };

const REFERENCIAS_CLIENTE: Record<TabelaReferencia, string> = {
    credits: 'SELECT id, clientId, clientName FROM credits',
    contracts: 'SELECT id, clientId, clientName FROM contracts',
    warranties: 'SELECT id, clientId, NULL AS clientName FROM warranties',
    legal_cases: 'SELECT id, clientId, NULL AS clientName FROM legal_cases',
    collection_messages: 'SELECT id, clientId, clientName FROM collection_messages',
    simulations: 'SELECT id, clientId, clientName FROM simulations',
};
const RETIDO_POR_NIF = /UNIQUE constraint failed: clients\.(nif|phone)/iu;
const REACTIVAR_SQL = `UPDATE sync_conflicts SET status = 'pending', resolvedBy = NULL, resolvedAt = NULL WHERE id = ? AND status = 'archived'`;
const motivo = (operation: string) => {
    try { return String(JSON.parse(operation)?.reason || ''); } catch { return ''; }
};

/** Alterações de clientes arquivadas por NIF/telefone repetido voltam à fila (a base já os aceita repetidos). */
export const reactivarRetidosPorNif = async (deps: DepsManutencao) => {
    const archived = await deps.all<{ id: string; operation: string }>(`SELECT id, operation FROM sync_conflicts WHERE status = 'archived' AND entityType = 'clients'`);
    const revive = archived.filter(row => RETIDO_POR_NIF.test(motivo(row.operation)));
    if (revive.length) await deps.transaction(revive.map(row => ({ sql: REACTIVAR_SQL, params: [row.id] })));
    return revive.length;
};

/** Clientes repetidos (mesmo NIF e nome) fundidos e fusões erradas desfeitas — ver fusao-clientes.ts. */
export const reconciliarClientes = async (deps: DepsManutencao, agora = new Date().toISOString()) => {
    const clientes = await deps.all<ClienteParaFusao>('SELECT id, name, nif, createdAt, deletedAt, deletedBy FROM clients');
    const ids = [...clientesEnvolvidos(clientes)];
    if (!ids.length) return { restaurados: 0, fundidos: 0, religados: 0 };
    const marcas = ids.map(() => '?').join(', ');
    const referencias: ReferenciaCliente[] = [];
    for (const [table, sql] of Object.entries(REFERENCIAS_CLIENTE) as Array<[TabelaReferencia, string]>) {
        try {
            const rows = await deps.all<{ id: string; clientId: string; clientName?: string | null }>(`${sql} WHERE clientId IN (${marcas})`, ids);
            referencias.push(...rows.map(row => ({ table, id: String(row.id), clientId: String(row.clientId), clientName: row.clientName })));
        } catch { /* tabela ou coluna ainda inexistente nesta base */ }
    }
    const plano = planoReconciliacaoClientes(clientes, referencias, agora);
    for (let start = 0; start < plano.statements.length; start += 200) await deps.transaction(plano.statements.slice(start, start + 200));
    return { restaurados: plano.restaurados, fundidos: plano.fundidos, religados: plano.religados };
};

// Processamento salarial: até 19/11/2026 o processamento normal do mês tinha um identificador aleatório em cada
// computador (rh-proc-normal-AAAA-MM desde então). As alterações das versões anteriores apontam para processamentos,
// recibos ou valores do mês que não existem neste computador — nunca se vão aplicar; o próximo cálculo alinha tudo.
const TABELAS_PROCESSAMENTO_RH = new Set(['rh_processamento', 'rh_recibo', 'rh_recibo_linha', 'rh_processamento_entrada', 'rh_rubrica_pontual']);
export const NOTA_PROCESSAMENTO_RH = 'Alteração de um processamento salarial que não existe neste computador (versão anterior à unificação do mês). Recalcule o mês para alinhar.';
const REGISTO_RH_SQL = `SELECT 1 AS found FROM rh_processamento WHERE id = ? UNION ALL SELECT 1 FROM rh_recibo WHERE id = ?
    UNION ALL SELECT 1 FROM rh_processamento_entrada WHERE id = ? UNION ALL SELECT 1 FROM rh_rubrica_pontual WHERE id = ? LIMIT 1`;
/** A alteração só refere identificadores de processamento/recibo/valores do mês que não existem aqui. */
const processamentoRhInexistente = async (deps: DepsManutencao, params: string[]) => {
    if (params.some(param => param.startsWith('rh-proc-normal-'))) return false;
    const ids = params.filter(param => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:\d+)?$/iu.test(param));
    if (!ids.length) return false;
    for (const id of ids) {
        const base = id.replace(/:\d+$/u, '');
        try {
            if ((await deps.all(REGISTO_RH_SQL, [base, base, base, base])).length) return false;
        } catch { return false; }
    }
    return true;
};

/**
 * Conflitos que já não têm efeito e se resolvem sozinhos: a alteração condicionada de um cliente apagado
 * definitivamente (lápide, ou «Apagar definitivamente» de uma ficha que já não existe aqui) e um lançamento
 * contabilístico que já existe aqui com o mesmo identificador (o mesmo movimento recebido por outra cadeia).
 */
export const resolverConflitosSemEfeito = async (deps: DepsManutencao, agora = new Date().toISOString()) => {
    const rows = await deps.all<{ id: string; entityType: string; operation: string }>(`SELECT id, entityType, operation FROM sync_conflicts WHERE status = 'pending'`);
    const statements: ComandoManutencao[] = [];
    for (const row of rows) {
        let operation: { reason?: string; params?: unknown[]; kind?: string; columns?: string[]; statementId?: string } | null = null;
        try { operation = JSON.parse(row.operation); } catch { continue; }
        if (!operation) continue;
        const reason = String(operation.reason || '');
        const params = Array.isArray(operation.params) ? operation.params.map(param => String(param ?? '')) : [];
        if (/esperadas \d+ altera/iu.test(reason)) {
            let semEfeito = params.some(param => deps.tombstoned?.('clients', param));
            if (!semEfeito && params.some(param => param.startsWith('purged:'))) {
                const candidatos = params.filter(param => param && !param.startsWith('purged:'));
                const marcas = candidatos.map(() => '?').join(', ');
                const existentes = candidatos.length ? await deps.all<{ id: string }>(`SELECT id FROM clients WHERE id IN (${marcas})`, candidatos) : [];
                semEfeito = !existentes.length && candidatos.some(param => /^[0-9a-f-]{20,}$/iu.test(param));
            }
            if (semEfeito) {
                statements.push({ sql: CONFLICT_RESOLVE_SQL, params: ['O cliente foi apagado definitivamente; a alteração já não se aplica.', agora, row.id] });
                continue;
            }
        }
        if (TABELAS_PROCESSAMENTO_RH.has(row.entityType) && await processamentoRhInexistente(deps, params)) {
            statements.push({ sql: CONFLICT_RESOLVE_SQL, params: [NOTA_PROCESSAMENTO_RH, agora, row.id] });
            continue;
        }
        if (row.entityType === 'accounting_entries' && /Cadeia contabil/iu.test(reason)) {
            const columns = operation.columns || [];
            const entryId = operation.kind === 'snapshot'
                ? params[columns.indexOf('id')]
                : statementRowId(deps.sqlById.get(String(operation.statementId || '')) || '', operation.params || []);
            if (entryId && (await deps.all('SELECT 1 AS found FROM accounting_entries WHERE id = ? LIMIT 1', [String(entryId)])).length) {
                statements.push({ sql: CONFLICT_RESOLVE_SQL, params: ['O lançamento já existe neste dispositivo (o mesmo movimento recebido outra vez).', agora, row.id] });
            }
        }
    }
    if (statements.length) await deps.transaction(statements);
    return statements.length;
};

// A versão de 28/10/2026 gravou no computador alertas falsos «acção sem permissão» a cada sincronização (a
// reconciliação tentava religar aprovações de crédito pelo canal do ecrã). Saem das notificações; o registo de
// segurança e a auditoria ficam como estão.
export const LIMPAR_ALERTAS_FALSOS_SQL = `DELETE FROM notifications WHERE title LIKE 'Alerta de segurança: Tentativa de acção sem permissão%' AND message LIKE '%A decisão exige o responsável autenticado e diferente do solicitante%' AND timestamp >= '2026-10-28'`;

/** Toda a manutenção, por esta ordem. Cada parte que falha não impede as outras. */
export const executarManutencaoSync = async (deps: DepsManutencao, opcoes: { limparAlertasFalsos?: boolean } = {}): Promise<ResultadoManutencao & { erros: string[] }> => {
    const resultado: ResultadoManutencao & { erros: string[] } = { reactivados: 0, restaurados: 0, fundidos: 0, religados: 0, resolvidos: 0, alertasLimpos: 0, erros: [] };
    const passo = async (nome: string, fazer: () => Promise<void>) => {
        try { await fazer(); } catch (error) { resultado.erros.push(`${nome}: ${error instanceof Error ? error.message : String(error)}`); }
    };
    await passo('retidas por NIF', async () => { resultado.reactivados = await reactivarRetidosPorNif(deps); });
    await passo('clientes', async () => { Object.assign(resultado, await reconciliarClientes(deps)); });
    await passo('conflitos sem efeito', async () => { resultado.resolvidos = await resolverConflitosSemEfeito(deps); });
    if (opcoes.limparAlertasFalsos) await passo('alertas falsos', async () => {
        const antes = await deps.all<{ total: number }>(`SELECT COUNT(*) AS total FROM notifications WHERE title LIKE 'Alerta de segurança: Tentativa de acção sem permissão%' AND message LIKE '%A decisão exige o responsável autenticado e diferente do solicitante%' AND timestamp >= '2026-10-28'`);
        resultado.alertasLimpos = Number(antes[0]?.total || 0);
        if (resultado.alertasLimpos) await deps.transaction([{ sql: LIMPAR_ALERTAS_FALSOS_SQL }]);
    });
    return resultado;
};
