import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { applyRemoteGroups, type SyncOperation, type SyncStatement } from '../src/bibliotecas/sync-operacoes.ts';
import { clienteQueFica, clientesEnvolvidos, planoReconciliacaoClientes, type ClienteParaFusao, type ReferenciaCliente } from '../src/bibliotecas/fusao-clientes.ts';

const SQL = new Map([
    ['ins-client', 'INSERT INTO clients (id, name, nif, phone, createdAt) VALUES (?, ?, ?, ?, ?)'],
    ['ins-credit', 'INSERT INTO credits (id, clientId, clientName) VALUES (?, ?, ?)'],
]);
// Base de um dispositivo como a da versão nova: NIF e telefone sem unicidade (índices simples).
const device = () => {
    const database = new DatabaseSync(':memory:');
    database.exec(`CREATE TABLE clients (id TEXT PRIMARY KEY, name TEXT, nif TEXT, phone TEXT, createdAt TEXT, deletedAt TEXT, deletedBy TEXT);
        CREATE INDEX idx_clients_nif ON clients(nif);
        CREATE INDEX idx_clients_phone ON clients(phone);
        CREATE TABLE credits (id TEXT PRIMARY KEY, clientId TEXT, clientName TEXT);
        CREATE TABLE contracts (id TEXT PRIMARY KEY, clientId TEXT, clientName TEXT);
        CREATE TABLE sync_conflicts (id TEXT PRIMARY KEY, entityType TEXT, entityId TEXT, operation TEXT, status TEXT, createdAt TEXT, resolutionNote TEXT, resolvedBy TEXT, resolvedAt TEXT);`);
    const transaction = async (statements: SyncStatement[]) => {
        database.exec('BEGIN');
        try { for (const s of statements) database.prepare(s.sql).run(...((s.params || []) as never[])); database.exec('COMMIT'); }
        catch (error) { database.exec('ROLLBACK'); throw error; }
    };
    const tableColumns = async (table: string) => new Set((database.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map(r => r.name));
    return { database, deps: { sqlById: SQL, tableColumns, transaction } };
};
const cliente = (id: string, name: string, nif: string, createdAt: string, phone = `9${id.length}${createdAt.slice(11, 13)}`): SyncOperation[] => {
    const meta = { txId: `tx-${id}`, txSize: 2, deviceId: 'pc', kind: 'statement' as const, commandVersion: 1, tenantId: 't', createdAt };
    return [
        { ...meta, id: `o1-${id}`, statementId: 'ins-client', params: [id, name, nif, phone, createdAt] },
        { ...meta, id: `o2-${id}`, statementId: 'ins-credit', params: [`cr-${id}`, id, name] },
    ];
};
// O que o serviço faz depois de cada sincronização (reconcileClients), sobre esta base.
const reconciliar = async (database: DatabaseSync, transaction: (s: SyncStatement[]) => Promise<void>) => {
    const clientes = database.prepare('SELECT id, name, nif, createdAt, deletedAt, deletedBy FROM clients').all().map(row => ({ ...row })) as ClienteParaFusao[];
    const ids = [...clientesEnvolvidos(clientes)];
    const referencias: ReferenciaCliente[] = [];
    if (ids.length) for (const table of ['credits', 'contracts'] as const) {
        const rows = database.prepare(`SELECT id, clientId, clientName FROM ${table} WHERE clientId IN (${ids.map(() => '?').join(', ')})`).all(...ids) as Array<{ id: string; clientId: string; clientName: string }>;
        referencias.push(...rows.map(row => ({ table, id: row.id, clientId: row.clientId, clientName: row.clientName })));
    }
    const plano = planoReconciliacaoClientes(clientes, referencias, '2026-10-27T20:00:00.000Z');
    if (plano.statements.length) await transaction(plano.statements);
    return plano;
};
const activos = (db: DatabaseSync) => (db.prepare('SELECT id FROM clients WHERE deletedAt IS NULL ORDER BY id').all() as Array<{ id: string }>).map(row => row.id);
const dono = (db: DatabaseSync, creditId: string) => (db.prepare('SELECT clientId FROM credits WHERE id = ?').get(creditId) as { clientId: string }).clientId;

test('pessoas diferentes com o mesmo BI (ou telefone) chegam as duas e ficam as duas na lista, cada uma com o seu crédito', async () => {
    const { database, deps } = device();
    const groups = [
        { operations: cliente('cl-stanislau', 'Stanislau Ernesto Bastos', '003708339BA039', '2026-10-20T09:00:00.000Z', '922007683') },
        { operations: cliente('cl-firmino', 'FIRMINO AMERICO PEDRO', '003708339BA039', '2026-10-20T11:00:00.000Z', '922007683') },
    ];
    assert.deepEqual(await applyRemoteGroups(groups, deps), { applied: 4, conflicts: 0 });
    const plano = await reconciliar(database, deps.transaction);
    assert.equal(plano.statements.length, 0, 'nomes diferentes: não se fundem');
    assert.deepEqual(activos(database), ['cl-firmino', 'cl-stanislau']);
    assert.equal(dono(database, 'cr-cl-firmino'), 'cl-firmino');
});

test('a mesma pessoa registada em dois computadores fica uma só (a mais antiga), com os créditos dos dois — também os que chegam depois', async () => {
    const { database, deps } = device();
    await applyRemoteGroups([{ operations: cliente('cl-benguela', 'Sukeina Capingana Ricaxi', '00999LA041', '2026-10-27T15:00:00.000Z') }], deps);
    await applyRemoteGroups([{ operations: cliente('cl-luanda', 'SUKEINA  Capingana Ricaxí', '00999-LA-041', '2026-10-27T10:37:00.000Z') }], deps);
    const plano = await reconciliar(database, deps.transaction);
    assert.equal(plano.fundidos, 1);
    assert.deepEqual(activos(database), ['cl-luanda']);
    assert.equal(dono(database, 'cr-cl-benguela'), 'cl-luanda');
    // Um contrato do registo fundido que chega mais tarde também passa para o que ficou.
    database.prepare('INSERT INTO contracts VALUES (?, ?, ?)').run('ct-tarde', 'cl-benguela', 'Sukeina Capingana Ricaxi');
    await reconciliar(database, deps.transaction);
    assert.equal((database.prepare("SELECT clientId FROM contracts WHERE id = 'ct-tarde'").get() as { clientId: string }).clientId, 'cl-luanda');
    assert.equal((await reconciliar(database, deps.transaction)).statements.length, 0, 'depois de reconciliado, nada a fazer');
});

test('a fusão errada da versão anterior (mesmo NIF, nomes diferentes) é desfeita e os créditos voltam ao dono pelo nome', async () => {
    const { database, deps } = device();
    database.exec(`INSERT INTO clients VALUES ('cl-stanislau', 'Stanislau Ernesto Bastos', '003708339BA039', '922007683', '2026-10-20T09:00:00.000Z', NULL, NULL);
        INSERT INTO clients VALUES ('cl-firmino', 'FIRMINO AMERICO PEDRO', '003708339BA039', '922007683', '2026-10-20T11:00:00.000Z', '2026-10-27T18:10:00.000Z', 'Fundido com o cliente cl-stanislau (mesmo NIF)');
        INSERT INTO credits VALUES ('cr-s', 'cl-stanislau', 'Stanislau Ernesto Bastos');
        INSERT INTO credits VALUES ('cr-f', 'cl-stanislau', 'FIRMINO AMERICO PEDRO');
        INSERT INTO contracts VALUES ('cr-f', 'cl-stanislau', 'Firmino Américo Pedro');`);
    const plano = await reconciliar(database, deps.transaction);
    assert.equal(plano.restaurados, 1);
    assert.deepEqual(activos(database), ['cl-firmino', 'cl-stanislau']);
    assert.equal(dono(database, 'cr-f'), 'cl-firmino');
    assert.equal(dono(database, 'cr-s'), 'cl-stanislau');
    assert.equal((database.prepare("SELECT clientId FROM contracts WHERE id = 'cr-f'").get() as { clientId: string }).clientId, 'cl-firmino');
    assert.equal((await reconciliar(database, deps.transaction)).statements.length, 0);
});

test('a fusão anterior da mesma pessoa mantém-se; sem data ganha o menor ID', () => {
    const clientes: ClienteParaFusao[] = [
        { id: 'a', name: 'Ana', nif: '1234567', createdAt: '2026-01-01' },
        { id: 'b', name: 'ANA', nif: '1234567', createdAt: '2026-02-01', deletedAt: '2026-10-27', deletedBy: 'Fundido com o cliente a (mesmo NIF)' },
    ];
    const plano = planoReconciliacaoClientes(clientes, [{ table: 'credits', id: 'c1', clientId: 'b', clientName: 'Ana' }]);
    assert.equal(plano.restaurados, 0);
    assert.deepEqual(plano.statements.map(s => s.params), [['a', 'c1']]);
    assert.equal(clienteQueFica({ id: 'b', createdAt: 'x' }, { id: 'a', createdAt: 'y' }).id, 'a');
    assert.equal(clientesEnvolvidos([{ id: 'x', name: 'Sem BI', nif: 'SEM-1234', createdAt: '' }, { id: 'y', name: 'Sem BI', nif: 'SEM-1234', createdAt: '' }]).size, 0, '«SEM-…» não é NIF');
});
