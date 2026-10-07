// Todos os relatórios PDF são gerados com dados de exemplo exigentes (nomes e moradas longos, muitas
// linhas) e nenhum texto pode ficar por cima de outro texto, das molduras, do cabeçalho, do rodapé ou
// fora da página; todas as páginas têm a linha de contactos com ícones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

test('nenhum relatório PDF tem elementos sobrepostos', () => {
    const run = spawnSync(process.execPath, [path.join(root, 'scripts', 'verificar-pdfs.mjs'), root], { cwd: root, encoding: 'utf8', timeout: 240_000 });
    const output = `${run.stdout || ''}${run.stderr || ''}`;
    const summary = output.match(/TOTAL: (\d+) problema\(s\) e (\d+) erro\(s\) em (\d+) documento\(s\)/);
    assert.ok(summary, `o verificador não terminou:\n${output.slice(-2000)}`);
    const report = output.split('\n').filter(line => /^(⚠|✖|    p)/.test(line)).join('\n');
    assert.equal(Number(summary[2]), 0, `relatórios com erro:\n${report}`);
    assert.equal(Number(summary[1]), 0, `sobreposições encontradas:\n${report}`);
    assert.ok(Number(summary[3]) >= 38, 'todos os relatórios foram verificados');
});
