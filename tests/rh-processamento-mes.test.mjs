// Processamento mês a mês sobre uma base SQLite real: salário do mês e faltas lançados no ecrã, desconto das faltas pelo
// valor-dia ou pelo valor configurado, abonos fixos do registo, e valores bloqueados depois da aprovação.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;

let modules;
async function loadModules() {
    if (modules) return modules;
    const outdir = mkdtempSync(path.join(tmpdir(), 'proc-mes-'));
    const outfile = path.join(outdir, 'proc.mjs');
    await build({
        stdin: {
            contents: `
                export { ServicoSalariosRH } from '@/servicos/rh/ServicoSalariosRH';
                export { ServicoRH } from '@/servicos/rh/ServicoRH';
                export * as E from '@/bibliotecas/rh/esquema-rh';
                export { RH_SALARIOS_SCHEMA_SQL } from '@/bibliotecas/rh/esquema-rh-salarios';
            `,
            resolveDir: root, loader: 'ts',
        },
        bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
        define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/', MODE: 'test', DEV: false, PROD: true }) },
        banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
        loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.webp': 'dataurl' },
        plugins: [{
            name: 'test-db',
            setup(builder) {
                builder.onResolve({ filter: /^@\/bibliotecas\/bd$/ }, () => ({ path: 'test-db', namespace: 'test-db' }));
                builder.onLoad({ filter: /.*/, namespace: 'test-db' }, () => ({ contents: 'export const db = new Proxy({}, { get: (_, key) => globalThis.__testDb[key] });', loader: 'js' }));
                builder.onResolve({ filter: /^@\// }, async args => builder.resolve(path.join(root, 'src', args.path.slice(2)), { kind: args.kind, resolveDir: root }));
            },
        }],
    });
    modules = await import(pathToFileURL(outfile).href);
    rmSync(outdir, { recursive: true, force: true });
    return modules;
}

const RH = { id: 'u-rh', name: 'Rita RH', role: 'super_admin' };

async function createDatabase(M, valorFalta = '0') {
    const { RENDERER_SQL_ALLOWLIST } = await import('../electron/renderer-sql-allowlist.ts');
    const database = new DatabaseSync(':memory:');
    database.exec(`CREATE TABLE audit_logs (id TEXT PRIMARY KEY, timestamp TEXT, userId TEXT, userName TEXT, action TEXT, entity TEXT, details TEXT, previousState TEXT, newState TEXT, metadata TEXT)`);
    for (const sql of [...M.E.RH_FASE1_SQL, ...M.E.RH_FASE2_SQL, ...M.E.RH_PONTO_V2_SQL, ...M.E.RH_PONTO_V3_SQL, ...M.RH_SALARIOS_SCHEMA_SQL]) database.exec(sql);
    for (const [table, column, definition] of [...M.E.RH_PONTO_V2_COLUNAS, ...M.E.RH_PONTO_V3_COLUNAS, ...M.E.RH_FOLHA_COLUNAS]) { try { database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); } catch { /* já existe */ } }
    const params = values => (values || []).map(value => value === undefined ? null : value);
    const normalizar = sql => sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim().replace(/;$/u, '');
    const prepare = sql => {
        if (!RENDERER_SQL_ALLOWLIST.has(normalizar(sql))) throw new Error(`SQL fora da lista do desktop: ${normalizar(sql).slice(0, 120)}`);
        return database.prepare(sql);
    };
    globalThis.__testDb = {
        all: async (sql, values) => prepare(sql).all(...params(values)),
        get: async (sql, values) => prepare(sql).get(...params(values)),
        run: async (sql, values) => prepare(sql).run(...params(values)),
        transaction: async statements => {
            database.exec('BEGIN');
            try {
                for (const s of statements) {
                    const result = prepare(s.sql).run(...params(s.params));
                    if (s.expectChanges !== undefined && Number(result.changes) !== s.expectChanges) throw new Error(`Conflito de concorrência: ${s.sql.slice(0, 60)}`);
                }
                database.exec('COMMIT');
            } catch (error) { database.exec('ROLLBACK'); throw error; }
        },
    };
    const now = new Date().toISOString();
    for (const seed of [...M.E.rhSeedStatements(now), ...M.E.rhSeedFase2Statements(now), ...M.E.rhSeedPontoStatements(now), ...M.E.rhSeedPontoV3Statements(now), ...M.E.rhSeedFolhaStatements(now), ...M.E.rhSeedFaltaStatements(now)]) database.prepare(seed.sql).run(...params(seed.params));
    database.prepare(`UPDATE rh_parametro SET valor = ? WHERE chave = 'valor_falta'`).run(valorFalta);
    return database;
}

async function registar(M) {
    const rubrica = codigo => M.ServicoRH.rubricas().then(l => l.find(r => r.codigo === codigo).id);
    const id = await M.ServicoRH.criarFuncionario({
        numero_mecanografico: '99445110', nome: 'Pedro de Morais Tango', data_admissao: '2026-01-02', estado: 'activo', iban: 'AO06000600009202770530191',
        vinculo: 'Comissão de Serviço', carreira: 'Chefia - Regime Geral/Local', cargo_id: 'cargo-x',
    }, { tipo: 'indeterminado', inicio: '2026-01-02', fim: null, periodo_experiencia_fim: null, salario_base_minor: 36_214_720, horas_semanais: 40, dias_ferias: 22 }, RH, [
        { rubrica_id: await rubrica('ISOLAMENTO'), valor_minor: 0 },
        { rubrica_id: await rubrica('RENDA_CASA'), valor_minor: 0 },
        { rubrica_id: await rubrica('REM_SUPLEMENTAR'), valor_minor: 3_000_000 },
    ]);
    return id;
}
const processamento = (M, id) => M.ServicoSalariosRH.processamentos().then(l => l.find(p => p.id === id));
const linhas = (db, funcionario) => db.prepare(`SELECT l.codigo, l.quantidade, l.valor_minor FROM rh_recibo_linha l JOIN rh_recibo r ON r.id = l.recibo_id WHERE r.funcionario_id = ? ORDER BY l.ordem`).all(funcionario);

test('mês aberto sem livro de ponto fechado: abonos do registo, salário do mês e faltas lançadas à mão (valor-dia)', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        const f = await registar(M);
        const id = await M.ServicoSalariosRH.abrir({ ano: 2026, mes: 10, tipo: 'normal' }, RH);
        await M.ServicoSalariosRH.calcular(await processamento(M, id), RH);
        let r = db.prepare('SELECT * FROM rh_recibo WHERE funcionario_id = ?').get(f);
        // Modelo de Setembro (que arredonda à dezena de cêntimos): 609.435,60 de abonos, INSS 17.383,10, IRT 99.661,00.
        // O motor arredonda ao cêntimo: 609.435,52 e 17.383,07.
        assert.equal(r.total_abonos_minor, 60_943_552);
        assert.equal(r.inss_minor, 1_738_307);
        assert.ok(Math.abs(r.irt_minor - 9_966_100) < 100, `IRT ${r.irt_minor}`);
        assert.match(r.avisos_json, /por fechar/u);

        await M.ServicoSalariosRH.guardarEntrada(await processamento(M, id), f, { faltas: 2 }, RH);
        assert.equal((await processamento(M, id)).estado, 'aberto', 'valores mudaram: volta a aberto');
        await M.ServicoSalariosRH.calcular(await processamento(M, id), RH);
        const falta = linhas(db, f).find(l => l.codigo === 'FALTAS');
        assert.deepEqual([falta.quantidade, falta.valor_minor], [2, Math.round(36_214_720 / 30 * 2)]);

        await M.ServicoSalariosRH.guardarEntrada(await processamento(M, id), f, { salario_base_minor: 40_000_000 }, RH);
        await M.ServicoSalariosRH.calcular(await processamento(M, id), RH);
        r = db.prepare('SELECT * FROM rh_recibo WHERE funcionario_id = ?').get(f);
        assert.equal(r.salario_base_minor, 40_000_000, 'o salário do mês sobrepõe o do contrato');
        assert.equal(linhas(db, f).find(l => l.codigo === 'ISOLAMENTO').valor_minor, 12_000_000, 'percentagens sobre o salário do mês');
        assert.equal(linhas(db, f).find(l => l.codigo === 'FALTAS').quantidade, 2, 'as faltas mantêm-se');

        await M.ServicoSalariosRH.aprovar(await processamento(M, id), RH);
        await assert.rejects(M.ServicoSalariosRH.guardarEntrada(await processamento(M, id), f, { faltas: 0 }, RH), /aprovado/u);
        assert.throws(() => db.prepare('UPDATE rh_processamento_entrada SET faltas = 0').run(), /não mudam/u);
    } finally { db.close(); }
});

test('valor de cada falta configurado: substitui o valor-dia', async () => {
    const M = await loadModules();
    const db = await createDatabase(M, '5000');
    try {
        const f = await registar(M);
        const id = await M.ServicoSalariosRH.abrir({ ano: 2026, mes: 10, tipo: 'normal' }, RH);
        await M.ServicoSalariosRH.guardarEntrada(await processamento(M, id), f, { faltas: 3 }, RH);
        await M.ServicoSalariosRH.calcular(await processamento(M, id), RH);
        const falta = linhas(db, f).find(l => l.codigo === 'FALTAS');
        assert.deepEqual([falta.quantidade, falta.valor_minor], [3, 1_500_000]);
    } finally { db.close(); }
});
