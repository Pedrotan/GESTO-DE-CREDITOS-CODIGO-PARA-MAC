import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { IDENTITY_PREFIX, publishCompanyIdentity, readCompanyIdentity, withCompanyIdentity } from '../src/bibliotecas/identidade-empresa-sync.ts';
import { applyRemoteGroups } from '../src/bibliotecas/sync-operacoes.ts';

const TENANT = '5001032771';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7WQAAAAASUVORK5CYII=';
function device() {
    const database = new DatabaseSync(':memory:');
    database.exec('CREATE TABLE shared_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt TEXT NOT NULL, updatedBy TEXT)');
    const operations: Array<{sql: string; params: unknown[]}> = [];
    const store = {
        all: async <T>(sql: string, params: unknown[] = []) => database.prepare(sql).all(...params as never[]) as T[],
        run: async (sql: string, params: unknown[] = []) => { operations.push({sql,params}); return database.prepare(sql).run(...params as never[]); },
    };
    return { database, store, operations };
}
async function deliver(source: ReturnType<typeof device>, target: ReturnType<typeof device>) {
    const statements = source.operations.splice(0);
    const map = new Map(statements.map((item, index) => [String(index), item.sql]));
    const result = await applyRemoteGroups(statements.map((item, index) => ({ operations: [{
        id: `op-${index}-${Math.random()}`, deviceId: 'source', kind: 'statement' as const, statementId: String(index),
        params: item.params, createdAt: new Date().toISOString(), commandVersion: 1 as const, tenantId: TENANT,
    }] })), {
        sqlById: map,
        tableColumns: async () => new Set(['key','value','updatedAt','updatedBy']),
        transaction: async rows => {
            target.database.exec('BEGIN');
            try { for (const row of rows) target.database.prepare(row.sql).run(...(row.params || []) as never[]); target.database.exec('COMMIT'); }
            catch (error) { target.database.exec('ROLLBACK'); throw error; }
        },
    });
    assert.equal(result.conflicts, 0);
}

test('identidade desktop chega à web com bytes de imagem, contactos e morada, mantendo segredos locais', async () => {
    const desktop = device(), web = device();
    await publishCompanyIdentity(desktop.store, TENANT, {
        nif: TENANT, name: 'Empresa teste', address: 'Rua de teste', phone: '000000', website: 'https://example.invalid',
        logo: 'C:/perfil/logo.png', reportLogo: 'blob:logo-relatorio', watermarkLogo: PNG, primaryColor: [10,20,30],
        syncApiKey: 'segredo-local', licenseKey: 'licenca-local', smtpPassword: 'senha-local', enableMultiTenant: true,
    }, { seed: true, image: async () => PNG, now: '2026-10-18T12:00:00Z' });
    assert.ok(desktop.operations.length >= 9);
    const payload = JSON.stringify(desktop.operations);
    assert.doesNotMatch(payload, /segredo-local|licenca-local|senha-local|C:\/perfil|blob:logo/);
    await deliver(desktop, web);
    const settings = await withCompanyIdentity(web.store, { nif: TENANT, name: 'Empresa', address: '', syncApiKey: 'chave-web', smtpPassword: 'senha-web' });
    assert.equal(settings!.logo, PNG);
    assert.equal(settings!.reportLogo, PNG);
    assert.equal(settings!.watermarkLogo, PNG);
    assert.equal(settings!.address, 'Rua de teste');
    assert.equal(settings!.syncApiKey, 'chave-web');
    assert.equal(settings!.smtpPassword, 'senha-web');
    assert.equal(settings!.primaryColor, '[10,20,30]');
    desktop.database.close(); web.database.close();
});

test('alteração na web volta ao desktop; bootstrap vazio/antigo não apaga campos; remoção explícita chega', async () => {
    const desktop = device(), web = device();
    await publishCompanyIdentity(desktop.store,TENANT,{nif:TENANT,name:'Empresa antiga',address:'Morada antiga',logo:PNG},{seed:true,now:'2026-10-18T10:00:00Z'});
    await deliver(desktop, web);
    await publishCompanyIdentity(web.store,TENANT,{nif:TENANT,address:'Nova morada',logo:null},{fields:['address','logo'],now:'2026-10-18T12:00:00Z'});
    await deliver(web, desktop);
    assert.equal(await publishCompanyIdentity(desktop.store,TENANT,{nif:TENANT,name:'Empresa',address:'Morada antiga',logo:PNG},{seed:true}),0);
    const merged = await withCompanyIdentity(desktop.store,{nif:TENANT,address:'Morada antiga',logo:PNG});
    assert.equal(merged!.address,'Nova morada');
    assert.equal(merged!.logo,null);
    assert.deepEqual((merged as Record<string, unknown>)._identityClearedImages,['logo']);
    // Uma operação atrasada não substitui a alteração mais recente.
    await publishCompanyIdentity(web.store,TENANT,{nif:TENANT,address:'Atrasada'},{fields:['address'],now:'2026-10-18T11:00:00Z'});
    assert.equal((await readCompanyIdentity(web.store,TENANT)).address,'Nova morada');
    desktop.database.close(); web.database.close();
});

test('dados de outra empresa, caminhos locais e colunas não permitidas nunca são aplicados', async () => {
    const {database,store} = device();
    await assert.rejects(publishCompanyIdentity(store,TENANT,{nif:'123',name:'Outra'}),/não corresponde/);
    await publishCompanyIdentity(store,TENANT,{nif:TENANT,logo:'file:///C:/logo.png'},{fields:['logo']});
    assert.deepEqual(await readCompanyIdentity(store,TENANT),{});
    for (const [field, value, tenantId] of [['name','Outra','123'],['licenseKey','injetada',TENANT],['logo','C:/logo.png',TENANT],['nif','123',TENANT]]) {
        database.prepare('INSERT OR REPLACE INTO shared_settings VALUES (?,?,?,NULL)').run(`${IDENTITY_PREFIX}${field}`,JSON.stringify({tenantId,value}),'2026-10-18');
    }
    assert.deepEqual(await readCompanyIdentity(store,TENANT),{});
    database.close();
});
