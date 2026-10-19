import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { IDENTITY_PREFIX, SETTINGS_PREFIX, publishCompanyIdentity, publishCompanyProfile, readCompanyIdentity, readCompanySettings, withCompanyIdentity } from '../src/bibliotecas/identidade-empresa-sync.ts';
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

test('coordenadas bancárias, modelos de contrato, signatários e módulos passam de um computador para outro sem segredos', async () => {
    const pcA = device(), pcB = device();
    const bank = [{ bank: 'Banco teste', iban: 'AO06 0000 0000 0000 0000 0000 0' }];
    const templates = [{ id: 't1', name: 'Modelo A', content: 'Cláusula primeira' }];
    await publishCompanyProfile(pcA.store, TENANT, {
        nif: TENANT, bankingInfo: bank, contractTemplates: JSON.stringify(templates), authorizedSigners: ['Gerente'],
        digitalSignatureEnabled: false, enableSuppliersModule: true, defaultSimulationInterestRate: 4.25, customClauses: 'Foro de Luanda',
        smtpPassword: 'senha-local', rescueKey: 'resgate-local', syncPasskey: 'passe-local', syncApiKey: 'api-local', licenseKey: 'licenca-local',
    }, { fields: ['bankingInfo', 'contractTemplates', 'authorizedSigners', 'digitalSignatureEnabled', 'enableSuppliersModule',
        'defaultSimulationInterestRate', 'customClauses', 'smtpPassword', 'rescueKey', 'syncPasskey', 'syncApiKey', 'licenseKey'], now: '2026-10-19T10:00:00Z' });
    assert.doesNotMatch(JSON.stringify(pcA.operations), /senha-local|resgate-local|passe-local|api-local|licenca-local/);
    await deliver(pcA, pcB);
    const merged = await withCompanyIdentity(pcB.store, { nif: TENANT, bankingInfo: '[]', contractTemplates: '[]', digitalSignatureEnabled: 1,
        enableSuppliersModule: 0, smtpPassword: 'senha-b', syncPasskey: 'passe-b' }) as Record<string, unknown>;
    assert.deepEqual(JSON.parse(String(merged.bankingInfo)), bank);
    assert.deepEqual(JSON.parse(String(merged.contractTemplates)), templates);
    assert.deepEqual(JSON.parse(String(merged.authorizedSigners)), ['Gerente']);
    assert.equal(merged.digitalSignatureEnabled, 0);
    assert.equal(merged.enableSuppliersModule, 1);
    assert.equal(merged.defaultSimulationInterestRate, 4.25);
    assert.equal(merged.customClauses, 'Foro de Luanda');
    assert.equal(merged.smtpPassword, 'senha-b');
    assert.equal(merged.syncPasskey, 'passe-b');
    // Uma instalação nova com valores por omissão não semeia nem substitui o que já foi partilhado.
    await publishCompanyProfile(pcB.store, TENANT, { nif: TENANT, bankingInfo: '[]', enableSuppliersModule: 0 }, { seed: true });
    assert.deepEqual(JSON.parse(String((await readCompanySettings(pcB.store, TENANT)).bankingInfo)), bank);
    assert.equal((await readCompanySettings(pcB.store, TENANT)).enableSuppliersModule, 1);
    const fresh = device();
    await publishCompanyProfile(fresh.store, TENANT, { nif: TENANT, bankingInfo: '[]', contractTemplates: '[]', enableGatewaysModule: 1,
        digitalSignatureEnabled: 1, defaultSimulationIof: 0.38 }, { seed: true });
    assert.deepEqual(await readCompanySettings(fresh.store, TENANT), {});
    // Formulário inteiro gravado com valores antigos (carregado antes da sincronização) não substitui o partilhado.
    await publishCompanyProfile(pcB.store, TENANT, { nif: TENANT, bankingInfo: '[]', enableSuppliersModule: false, enableLegalModule: false },
        { fields: ['bankingInfo', 'enableSuppliersModule', 'enableLegalModule'], base: { nif: TENANT, bankingInfo: [], enableSuppliersModule: false, enableLegalModule: true } });
    const afterStale = await readCompanySettings(pcB.store, TENANT);
    assert.deepEqual(JSON.parse(String(afterStale.bankingInfo)), bank);
    assert.equal(afterStale.enableSuppliersModule, 1);
    assert.equal(afterStale.enableLegalModule, 0);
    // Alteração no segundo computador volta ao primeiro; uma operação atrasada não a substitui.
    await publishCompanyProfile(pcB.store, TENANT, { nif: TENANT, bankingInfo: [] }, { fields: ['bankingInfo'], now: '2026-10-19T12:00:00Z' });
    await deliver(pcB, pcA);
    await publishCompanyProfile(pcA.store, TENANT, { nif: TENANT, bankingInfo: bank }, { fields: ['bankingInfo'], now: '2026-10-19T11:00:00Z' });
    assert.equal((await readCompanySettings(pcA.store, TENANT)).bankingInfo, '[]');
    pcA.database.close(); pcB.database.close(); fresh.database.close();
});

test('definições partilhadas de outra empresa, segredos ou valores inválidos nunca são aplicados', async () => {
    const { database, store } = device();
    await assert.rejects(publishCompanyProfile(store, TENANT, { nif: '123', bankingInfo: [{ iban: 'x' }] }, { fields: ['bankingInfo'] }), /não correspondem/);
    for (const [field, value, tenantId] of [['bankingInfo', '[{"iban":"x"}]', '123'], ['smtpPassword', 'injetada', TENANT],
        ['contractTemplates', '{"não":"lista"}', TENANT], ['enableLegalModule', 'talvez', TENANT], ['defaultSimulationIof', -1, TENANT]] as const) {
        database.prepare('INSERT OR REPLACE INTO shared_settings VALUES (?,?,?,NULL)').run(`${SETTINGS_PREFIX}${field}`, JSON.stringify({ tenantId, value }), '2026-10-19');
    }
    assert.deepEqual(await readCompanySettings(store, TENANT), {});
    database.close();
});
