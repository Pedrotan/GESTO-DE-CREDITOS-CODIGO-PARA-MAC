import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { allowsLicensedFeature, canHostLocalServer, assertLocalServerAccess } from '../src/bibliotecas/intranet-policy.ts';
import { assertIntranetLicense } from '../electron/intranet-license.ts';
import type { CloudLicenseStatus } from '../electron/licenca-nuvem.ts';

const cloud = (features: Record<string, unknown> = {}, tier = 'empresarial', state: CloudLicenseStatus['state'] = 'active'): CloudLicenseStatus => ({state, licenca: {
    empresaId: 'empresa', plano: 'annual', planoNome: 'Anual', escalao: tier, dataFim: null, validoAte: '2030-01-01', maxMaquinas: 5, funcionalidades: features,
}});
const NOW = Date.parse('2026-10-18T08:00:00Z');
const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKeys = [keys.publicKey.export({ format:'pem', type:'spki' }).toString()];
const legacy = (tier = 'empresarial', expired = false, features = {}) => {
    const payload = Buffer.from(JSON.stringify({ alg:'RS256',licenseVersion:2,kid:'tango-license-2026-01',jti:crypto.randomUUID(),type:'annual',tier,features,devices:5,mid:'GLOBAL',iat:'2026-01-01T00:00:00Z',exp:expired?'2026-02-01T00:00:00Z':'2027-01-01T00:00:00Z' })).toString('base64');
    const signature = crypto.sign('sha256',Buffer.from(payload), keys.privateKey).toString('base64');
    return Buffer.from(JSON.stringify({payload,signature})).toString('base64');
};

test('intranet e multiempresa são independentes; módulos explícitos prevalecem sobre o escalão', () => {
    assert.equal(allowsLicensedFeature({isValid:true,tier:'singular',features:{multi_empresa:true}},'intranet'), false);
    assert.equal(allowsLicensedFeature({isValid:true,tier:'empresarial',features:{intranet:false}},'intranet'), false);
    assert.equal(allowsLicensedFeature({isValid:true,tier:'singular',features:{intranet:true}},'intranet'), true);
    assert.equal(allowsLicensedFeature({isValid:true,tier:'empresarial'},'intranet'), false);
    assert.equal(allowsLicensedFeature({isValid:true,readOnly:true,features:{intranet:true}},'intranet'), false);
    assert.equal(allowsLicensedFeature({isValid:true,tier:'empresarial'},'multi_empresa'), false);
    assert.equal(allowsLicensedFeature({isValid:false,tier:'empresarial',features:{intranet:true}},'intranet'), false);
});
test('a web nunca pode hospedar servidor, mesmo com intranet; licença por carregar também bloqueia', () => {
    const valid = {isValid:true,tier:'empresarial',features:{intranet:true}};
    assert.equal(canHostLocalServer(false,valid), false);
    assert.throws(()=>assertLocalServerAccess(false,valid), /desktop/);
    assert.equal(canHostLocalServer(true,null), false);
    assert.throws(()=>assertLocalServerAccess(true,null), /licença válida/);
    assert.doesNotThrow(()=>assertLocalServerAccess(true,valid));
});
test('processo principal recusa o plano sem intranet e uma licença expirada sem recorrer à chave antiga', () => {
    assert.doesNotThrow(()=>assertIntranetLicense(cloud({intranet:true},'singular'),'',[],NOW));
    assert.throws(()=>assertIntranetLicense(cloud({intranet:false}),legacy(),publicKeys,NOW), /intranet/);
    assert.throws(()=>assertIntranetLicense(cloud({},'empresarial','readonly'),legacy(),publicKeys,NOW), /intranet/);
});
test('licenças RSA exigem módulo assinado explícito; escalão sozinho, chaves forjadas ou expiradas não ativam', () => {
    assert.doesNotThrow(()=>assertIntranetLicense({state:'none'},legacy('empresarial',false,{intranet:true}),publicKeys,NOW));
    assert.throws(()=>assertIntranetLicense({state:'none'},legacy(),publicKeys,NOW), /intranet/);
    assert.throws(()=>assertIntranetLicense({state:'none'},legacy('singular'),publicKeys,NOW), /intranet/);
    assert.throws(()=>assertIntranetLicense({state:'none'},legacy('empresarial',true),publicKeys,NOW), /intranet/);
    assert.throws(()=>assertIntranetLicense({state:'none'},'licenca-forjada',publicKeys,NOW), /intranet/);
});
test('demonstração usa os módulos do plano e respeita a preferência pela licença antiga válida', () => {
    const trial = cloud({ intranet: true });
    trial.licenca!.plano = 'trial';
    assert.doesNotThrow(() => assertIntranetLicense(trial, '', publicKeys, NOW));
    assert.throws(() => assertIntranetLicense(trial, legacy('singular'), publicKeys, NOW), /intranet/);
    assert.throws(() => assertIntranetLicense({ ...trial, state: 'trial_ended' }, '', publicKeys, NOW), /intranet/);
});
