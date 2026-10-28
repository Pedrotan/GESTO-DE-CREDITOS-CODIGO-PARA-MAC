import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Regras puras do centro de actualizações: semver, elegibilidade por canal/rollout e feed do electron-updater.

const U = await import(pathToFileURL(path.join(import.meta.dirname, '..', 'vercel-api', '_actualizacoes.js')).href);

const release = (version, extra = {}) => ({
    id: `rel_${version}`, version, status: 'active', public: false, rolloutPercent: 100,
    files: { win: { path: 'Setup.exe', files: [{ url: 'Setup.exe', sha512: `${'A'.repeat(86)}==`, size: 10 }] } }, ...extra,
});

test('semver: ordem numérica, pré-versões antes da final, lixo recusado', () => {
    assert.equal(U.compareVersions('3.0.10', '3.0.9'), 1);
    assert.equal(U.compareVersions('3.1.0-beta.1', '3.1.0'), -1);
    assert.equal(U.compareVersions('3.0.3', '3.0.3'), 0);
    assert.throws(() => U.compareVersions('3.0', '3.0.1'));
    assert.equal(U.isSemver('3.0.4'), true);
    assert.equal(U.isSemver('03.0.4'), false);
    assert.equal(U.isSemver('3.0.4; rm -rf /'), false);
});

test('elegibilidade: equipa sempre; restantes só com o interruptor; suspensa para ninguém', () => {
    const internal = release('3.0.4');
    assert.equal(U.isEligible(internal, { team: true }), true);
    assert.equal(U.isEligible(internal, { team: false }), false);
    assert.equal(U.isEligible({ ...internal, public: true }, { team: false }), true);
    assert.equal(U.isEligible({ ...internal, public: true, status: 'paused' }, { team: true }), false);
});

test('pickRelease escolhe a versão mais alta elegível e com ficheiros para a plataforma', () => {
    const list = [release('3.0.4', { public: true }), release('3.0.5'), release('3.1.0', { public: true, files: { mac: release('x').files.win } })];
    assert.equal(U.pickRelease(list, { team: false, platform: 'win' }).version, '3.0.4');
    assert.equal(U.pickRelease(list, { team: true, platform: 'win' }).version, '3.0.5');
    assert.equal(U.pickRelease(list, { team: false, platform: 'mac' }).version, '3.1.0');
    assert.equal(U.pickRelease([], { team: true, platform: 'win' }), null);
});

test('rollout: bucket estável entre 0 e 99', () => {
    const id = '1b4e28ba-2fa1-4d2b-883f-0016d3cca427';
    const bucket = U.rolloutBucket(id, 'rel_3.0.4');
    assert.equal(bucket, U.rolloutBucket(id, 'rel_3.0.4'));
    assert.ok(bucket >= 0 && bucket < 100);
    const partial = release('3.0.4', { public: true, rolloutPercent: bucket + 1 });
    assert.equal(U.isEligible(partial, { deviceId: id, team: false }), true);
    assert.equal(U.isEligible({ ...partial, rolloutPercent: bucket }, { deviceId: id, team: false }), false);
});

test('latest.yml do electron-builder: lido, validado e regerado com endereços do feed', () => {
    const sha = `${'b'.repeat(86)}==`;
    const parsed = U.parseFeedYaml(`version: 3.0.4\nfiles:\n  - url: TangoGestaoCreditos_Setup.exe\n    sha512: ${sha}\n    size: 134318689\npath: TangoGestaoCreditos_Setup.exe\nsha512: ${sha}\nreleaseDate: '2026-10-24T22:41:18.767Z'\n`);
    assert.equal(parsed.version, '3.0.4');
    assert.deepEqual(parsed.files, [{ url: 'TangoGestaoCreditos_Setup.exe', sha512: sha, size: 134318689 }]);
    const feed = U.buildFeedYaml({ version: '3.0.4', publishedAt: '2026-10-25T10:00:00.000Z', files: { win: parsed } }, 'win');
    assert.match(feed, /url: files\/3\.0\.4\/TangoGestaoCreditos_Setup\.exe/);
    assert.match(feed, /^path: files\/3\.0\.4\/TangoGestaoCreditos_Setup\.exe$/m);
    assert.equal(U.parseFeedYaml(feed.replace(/files\/3\.0\.4\//g, '')).version, '3.0.4');
    assert.throws(() => U.parseFeedYaml(`version: 3.0.4\nfiles:\n  - url: ../../etc/passwd\n    sha512: ${sha}\n    size: 1\n`), /recusado/);
    assert.throws(() => U.parseFeedYaml(`version: 3.0.4\nfiles:\n  - url: https://outro.site/x.exe\n    sha512: ${sha}\n    size: 1\n`), /recusado/);
});

test('caminhos dos ficheiros nunca saem da pasta das actualizações', () => {
    const base = path.resolve('/srv/updates');
    assert.equal(U.releaseFilePath('3.0.4', 'Setup.exe', base), path.join(base, '3.0.4', 'Setup.exe'));
    assert.equal(U.releaseFilePath('3.0.4', '../Setup.exe', base), null);
    assert.equal(U.releaseFilePath('../3.0.4', 'Setup.exe', base), null);
});
