// Testes de segurança do módulo de Compliance (especificação, secção 8.3): autorização de cada comando, autor
// verificado, imutabilidade dos registos, SQL sem texto interpolado (injecção), dados mascarados, falhas que nunca
// contam como aprovação e controlos impostos no processo principal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import * as P from '../src/bibliotecas/compliance/permissoes-compliance.ts';
import * as E from '../src/bibliotecas/compliance/esquema-compliance.ts';
import { mascararDocumento } from '../src/bibliotecas/compliance/kyc.ts';
import { SYNC_EXCLUDED_TABLES } from '../src/bibliotecas/sync-operacoes.ts';

const sqlsDePermissoes = Object.entries(P).filter(([nome, v]) => nome.startsWith('SQL_') && typeof v === 'string') as Array<[string, string]>;
const colunasPorParametro = (sql: string) => {
    const insert = sql.match(/\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/u);
    return insert
        ? insert[1].split(',').map(c => c.trim()).filter((_, i) => insert[2].split(',')[i].trim() === '?')
        : (sql.match(/SET (.*) WHERE/u)?.[1] || '').split(',').filter(c => c.includes('?')).map(c => c.split('=')[0].trim());
};

test('cada comando de escrita do Compliance tem permissão; o autor gravado identifica o utilizador', () => {
    assert.ok(sqlsDePermissoes.length >= 35, `só ${sqlsDePermissoes.length} comandos encontrados`);
    const semAutor = new Set(['SQL_MODELO_DESACTIVAR', 'SQL_LISTA_VERSAO_DESACTIVAR', 'SQL_LISTA_BLOCO_GRAVAR', 'SQL_LISTA_BLOCO_LIMPAR', 'SQL_EVIDENCIA_FICHEIRO']);
    for (const [nome, sql] of sqlsDePermissoes) {
        const regra = P.regraEscritaCompliance(sql);
        assert.ok(regra, `${nome}: o processo principal não o reconhece (seria recusado)`);
        assert.ok((P.PERMISSOES_COMPLIANCE as readonly string[]).includes(regra.permissao), nome);
        if (semAutor.has(nome)) { assert.equal(regra.autor, null, nome); continue; }
        assert.notEqual(regra.autor, null, `${nome}: sem autor verificado`);
        const coluna = colunasPorParametro(sql)[regra.autor!];
        assert.match(coluna, /(_por|^por|responsavel_id)$/u, `${nome}: o parâmetro ${regra.autor} (${coluna}) não identifica o utilizador`);
    }
});

test('decisões exigem «Decidir», configuração exige «Modelo de risco» e comandos desconhecidos são recusados', () => {
    for (const nome of ['SQL_KYC_DECIDIR', 'SQL_AVALIACAO_REVER', 'SQL_DUPLICADO_REVER', 'SQL_SCREENING_DECIDIR', 'SQL_ALERTA_CONCLUIR', 'SQL_ALERTA_ENCERRAR',
        'SQL_CASO_ENCERRAR', 'SQL_DECISAO_REGISTAR', 'SQL_AUTORIZACAO_REGISTAR', 'SQL_LEVANTAMENTO_REGISTAR', 'SQL_PERFIL_KYC_DECIDIDO']) {
        assert.equal(P.regraEscritaCompliance((P as Record<string, string>)[nome])!.permissao, 'compliance_approve', nome);
    }
    for (const nome of ['SQL_MODELO_CRIAR', 'SQL_MODELO_DESACTIVAR', 'SQL_LISTA_VERSAO_CRIAR']) {
        assert.equal(P.regraEscritaCompliance((P as Record<string, string>)[nome])!.permissao, 'compliance_settings', nome);
    }
    for (const sql of ['DELETE FROM compliance_decisao', "UPDATE compliance_alerta SET estado = 'CLOSED' WHERE id = ?", 'UPDATE compliance_caso SET estado = ? WHERE id = ?']) {
        assert.equal(P.regraEscritaCompliance(sql), null, sql);
    }
});

test('registos de Compliance não se apagam (triggers em todas as tabelas, salvo a cache local das listas)', () => {
    const todos = [E.COMPLIANCE_FASE1_SQL, E.COMPLIANCE_FASE2_SQL, E.COMPLIANCE_FASE3_SQL, E.COMPLIANCE_FASE4_SQL, E.COMPLIANCE_FASE5_SQL].flat().join('\n');
    const tabelas = [...todos.matchAll(/CREATE TABLE IF NOT EXISTS (compliance_\w+)/gu)].map(m => m[1]);
    assert.ok(tabelas.length >= 20);
    for (const t of tabelas) {
        if (t === 'compliance_lista_bloco') continue;
        assert.ok(new RegExp(`BEFORE DELETE ON ${t}\\b`, 'u').test(todos), `${t}: pode ser apagada`);
    }
    assert.ok(SYNC_EXCLUDED_TABLES.has('compliance_lista_bloco'), 'a cache das listas fica fora da sincronização');
});

test('nenhum SQL do Compliance é montado com texto interpolado (protecção contra injecção)', () => {
    const pastas = ['src/bibliotecas/compliance', 'src/servicos/compliance', 'src/componentes/compliance', 'src/paginas/compliance'];
    for (const pasta of pastas) {
        for (const f of readdirSync(pasta)) {
            const texto = readFileSync(path.join(pasta, f), 'utf8');
            for (const m of texto.matchAll(/`\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b[^`]*`/giu)) {
                assert.ok(!m[0].includes('${'), `${pasta}/${f}: SQL com interpolação: ${m[0].slice(0, 80)}`);
            }
        }
    }
});

test('BI/NIF mascarado nunca revela o número completo', () => {
    for (const v of ['000000001LA001', '5000000005', '12345678']) {
        const m = mascararDocumento(v);
        assert.notEqual(m, v);
        assert.ok(m.includes('•'));
        assert.ok(m.replace(/•/gu, '').length <= 7, m);
    }
});

test('o processo principal impõe a permissão e o autor e o controlo do crédito', () => {
    const main = readFileSync('electron/main.ts', 'utf8');
    assert.match(main, /if \(table\.startsWith\('compliance_'\)\) \{ assertComplianceAutorizado\(event, statement\); continue; \}/u);
    assert.match(main, /statement\.params\?\.\[regra\.autor\] !== actor\.id/u);
    assert.match(main, /await assertControloCompliance\(statement,query\);/u);
    for (const t of ['credits', 'credit_approvals', 'credit_reinforcements']) assert.ok(main.includes(`table==='${t}'`), t);
    assert.match(main, /if\(resultado\.impede\)throw new Error\(mensagemControlo/u);
});

test('o serviço financeiro passa pelo controlo antes de conceder, aprovar e reforçar', () => {
    const fin = readFileSync('src/servicos/ServicoFinanceiro.ts', 'utf8');
    for (const op of ['conceder e desembolsar o crédito', 'aprovar e desembolsar o crédito', 'reforçar o crédito']) {
        assert.ok(fin.includes(`ServicoControloCredito.exigir(`) && fin.includes(`'${op}'`), op);
    }
});
