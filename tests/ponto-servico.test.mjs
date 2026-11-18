// Livro de ponto (serviço) sobre uma base SQLite real: marcações que nunca se apagam, acções em massa, registos da
// versão anterior, fecho do mês com totais para o processamento, reabertura, importação, justificações e quiosque.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
    const outdir = mkdtempSync(path.join(tmpdir(), 'ponto-'));
    const outfile = path.join(outdir, 'ponto.mjs');
    await build({
        stdin: {
            contents: `
                export { ServicoPontoRH } from '@/servicos/rh/ServicoPontoRH';
                export { ServicoTempoRH } from '@/servicos/rh/ServicoTempoRH';
                export * as E from '@/bibliotecas/rh/esquema-rh';
                export { MAPEAMENTO_ANTERIOR } from '@/bibliotecas/rh/ponto-importacao';
                export { luandaTodayKey } from '@/bibliotecas/fuso-angola';
                export { somarDias } from '@/bibliotecas/rh/ponto';
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
const CHEFE = { id: 'u-chefe', name: 'Carlos Chefe', role: 'manager', permissions: ['hr_view'] };
const FUNC = { id: 'u-func', name: 'Osvaldo Santos', role: 'manager', permissions: ['hr_self'] };

async function createDatabase(M, extraParametros = {}) {
    const { RENDERER_SQL_ALLOWLIST } = await import('../electron/renderer-sql-allowlist.ts');
    const database = new DatabaseSync(':memory:');
    for (const sql of RENDERER_SQL_ALLOWLIST) if (/^CREATE (TABLE|INDEX|UNIQUE INDEX|TRIGGER) IF NOT EXISTS (rh_|audit_logs|notifications)/u.test(sql) || /^CREATE TABLE IF NOT EXISTS (audit_logs|notifications)\b/u.test(sql)) { try { database.exec(sql); } catch { /* depende de outra tabela */ } }
    for (const sql of [...M.E.RH_FASE1_SQL, ...M.E.RH_FASE2_SQL, ...M.E.RH_PONTO_V2_SQL]) database.exec(sql);
    const adapter = readFileSync(path.join(root, 'src/bibliotecas/adaptador-sqlite.ts'), 'utf8');
    for (const [, table, column, , definition] of adapter.matchAll(/safeAddColumn\(\s*["'](\w+)["']\s*,\s*["'](\w+)["']\s*,\s*(["'])(.+?)\3\s*\)/g)) {
        try { database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); } catch { /* ausente ou já existe */ }
    }
    for (const [table, column, definition] of M.E.RH_PONTO_V2_COLUNAS) { try { database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); } catch { /* já existe */ } }
    database.exec(`CREATE TABLE IF NOT EXISTS rh_processamento (id TEXT PRIMARY KEY, ano INTEGER, mes INTEGER, tipo TEXT, estado TEXT)`);
    const params = values => (values || []).map(value => value === undefined ? null : value);
    globalThis.__testDb = {
        all: async (sql, values) => database.prepare(sql).all(...params(values)),
        get: async (sql, values) => database.prepare(sql).get(...params(values)),
        run: async (sql, values) => database.prepare(sql).run(...params(values)),
        transaction: async statements => {
            database.exec('BEGIN');
            try {
                for (const s of statements) {
                    const result = database.prepare(s.sql).run(...params(s.params));
                    if (s.expectChanges !== undefined && Number(result.changes) !== s.expectChanges) throw new Error(`Conflito de concorrência: ${s.sql.slice(0, 60)}`);
                }
                database.exec('COMMIT');
            } catch (error) { database.exec('ROLLBACK'); throw error; }
        },
    };
    const now = new Date().toISOString();
    for (const seed of [...M.E.rhSeedStatements(now), ...M.E.rhSeedFase2Statements(now), ...M.E.rhSeedPontoStatements(now)]) database.prepare(seed.sql).run(...params(seed.params));
    for (const [chave, valor] of Object.entries(extraParametros)) database.prepare(`UPDATE rh_parametro SET valor = ? WHERE chave = ?`).run(valor, chave);
    database.prepare(`INSERT INTO rh_departamento (id, nome, responsavel_id, criado_em) VALUES ('dep-loja', 'Loja', 'f-chefe', ?), ('dep-arm', 'Armazém', NULL, ?)`).run(now, now);
    const funcionario = (id, numero, nome, dep, utilizador) => database.prepare(`INSERT INTO rh_funcionario (id, numero_mecanografico, nome, data_admissao, departamento_id, horario_id, estado, utilizador_id, criado_em)
        VALUES (?, ?, ?, '2026-01-05', ?, 'horario-normal', 'activo', ?, ?)`).run(id, numero, nome, dep, utilizador, now);
    funcionario('f-osv', '0001', 'Osvaldo Santos', 'dep-loja', FUNC.id);
    funcionario('f-chefe', '0002', 'Carlos Chefe', 'dep-loja', CHEFE.id);
    funcionario('f-joao', '0003', 'João Manuel', 'dep-arm', null);
    return database;
}

const OUT = { ano: 2026, mes: 10 };
const marcacoesDe = (db, funcionario, data) => db.prepare('SELECT * FROM rh_marcacao WHERE funcionario_id = ? AND data = ? ORDER BY data_hora').all(funcionario, data);

test('marcar presente, editar com motivo e nunca apagar: a correcção anula e regista outra', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        const r = await M.ServicoPontoRH.acao({ celulas: [{ funcionarioId: 'f-osv', data: '2026-10-06' }], acao: 'presente' }, RH);
        assert.deepEqual([r.alteradas, r.ignoradas.length], [1, 0]);
        const [entrada] = marcacoesDe(db, 'f-osv', '2026-10-06');
        await assert.rejects(M.ServicoPontoRH.editarMarcacao({ funcionarioId: 'f-osv', data: '2026-10-06', marcacaoId: entrada.id, hora: '08:20', tipo: 'entrada', motivo: '' }, RH), /motivo/u);
        await M.ServicoPontoRH.editarMarcacao({ funcionarioId: 'f-osv', data: '2026-10-06', marcacaoId: entrada.id, hora: '08:20', tipo: 'entrada', motivo: 'Picou mais tarde no relógio' }, RH);
        const todas = marcacoesDe(db, 'f-osv', '2026-10-06');
        assert.deepEqual(todas.map(m => [m.data_hora.slice(11), m.anulada]), [['08:00', 1], ['08:20', 0], ['17:00', 0]]);
        assert.throws(() => db.prepare('DELETE FROM rh_marcacao').run(), /não se apagam/u);
        assert.throws(() => db.prepare(`UPDATE rh_marcacao SET data_hora = '2026-10-06T07:00' WHERE id = ?`).run(todas[1].id), /não se altera/u);
        const resumo = db.prepare(`SELECT entrada, saida, minutos_atraso, estado, editado_manualmente FROM rh_ponto WHERE id = 'f-osv:2026-10-06'`).get();
        assert.deepEqual({ ...resumo }, { entrada: '08:20', saida: '17:00', minutos_atraso: 10, estado: 'P', editado_manualmente: 1 }, 'atraso de 20 com tolerância 10: conta o excesso');
        const historico = await M.ServicoPontoRH.historicoDia('f-osv', '2026-10-06');
        assert.ok(historico.some(h => /Corrigiu a marcação 08:00 → 08:20/u.test(h.details) && JSON.parse(h.metadata).motivo === 'Picou mais tarde no relógio'));
    } finally { db.close(); }
});

test('acções em massa: só as células elegíveis mudam e o motivo é obrigatório', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        const celulas = ['2026-10-03', '2026-10-05', '2026-10-06', '2099-01-05'].map(data => ({ funcionarioId: 'f-joao', data }));
        await assert.rejects(M.ServicoPontoRH.acao({ celulas, acao: 'falta', massa: true }, RH), /motivo/u);
        const r = await M.ServicoPontoRH.acao({ celulas, acao: 'falta', massa: true, motivo: 'Faltou sem avisar' }, RH);
        assert.equal(r.alteradas, 2, 'sábado e dia futuro ignorados');
        assert.equal(r.ignoradas.length, 2);
        const faltas = db.prepare(`SELECT data_inicio, estado FROM rh_ausencia WHERE funcionario_id = 'f-joao' ORDER BY data_inicio`).all();
        assert.deepEqual(faltas.map(f => [f.data_inicio, f.estado]), [['2026-10-05', 'aprovada'], ['2026-10-06', 'aprovada']]);
        const limpar = await M.ServicoPontoRH.acao({ celulas: [{ funcionarioId: 'f-joao', data: '2026-10-05' }], acao: 'limpar', motivo: 'Afinal estava de serviço externo' }, RH);
        assert.equal(limpar.alteradas, 1);
        assert.equal(db.prepare(`SELECT estado FROM rh_ausencia WHERE data_inicio = '2026-10-05'`).get().estado, 'anulada', 'a falta não se apaga: anula-se');
    } finally { db.close(); }
});

test('o chefe só altera o seu departamento', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        const r = await M.ServicoPontoRH.acao({ celulas: [{ funcionarioId: 'f-osv', data: '2026-10-07' }, { funcionarioId: 'f-joao', data: '2026-10-07' }], acao: 'presente' }, CHEFE);
        assert.deepEqual([r.alteradas, r.ignoradas], [1, ['João Manuel 07/10/2026: sem permissão']]);
    } finally { db.close(); }
});

test('registo da versão anterior: conta como entrada e saída e passa a marcações ao ser editado', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        db.prepare(`INSERT INTO rh_ponto (id, funcionario_id, data, entrada, saida, criado_em) VALUES ('f-osv:2026-10-08', 'f-osv', '2026-10-08', '08:00', '18:30', ?)`).run(new Date().toISOString());
        const { grelha } = await M.ServicoPontoRH.grelha(2026, 10);
        const dia = grelha.linhas.find(l => l.funcionario.id === 'f-osv').dias.find(d => d.data === '2026-10-08');
        assert.deepEqual([dia.estado, dia.minutos_extra], ['P', 90]);
        await M.ServicoPontoRH.adicionarMarcacao({ funcionarioId: 'f-osv', data: '2026-10-08', hora: '12:00', tipo: 'inicio_pausa', motivo: 'Pausa esquecida' }, RH);
        const ids = marcacoesDe(db, 'f-osv', '2026-10-08').map(m => m.id);
        assert.ok(ids.includes('legado:f-osv:2026-10-08:e') && ids.length === 3, 'o registo antigo virou marcações rastreáveis');
    } finally { db.close(); }
});

test('fecho do mês: bloqueia com pendentes, converte em faltas se permitido, guarda os totais e bloqueia edições', async () => {
    const M = await loadModules();
    const db = await createDatabase(M, { ponto_lancar_falta_automatica: '1' });
    try {
        await assert.rejects(M.ServicoPontoRH.fecharMes(OUT.ano, OUT.mes, RH), /sem registo/u);
        await M.ServicoPontoRH.acao({ celulas: [{ funcionarioId: 'f-osv', data: '2026-10-09' }], acao: 'presente' }, RH);
        await M.ServicoPontoRH.adicionarMarcacao({ funcionarioId: 'f-osv', data: '2026-10-12', hora: '08:00', tipo: 'entrada', motivo: 'Só entrada registada' }, RH);
        await assert.rejects(M.ServicoPontoRH.fecharMes(OUT.ano, OUT.mes, RH, { converterPendentes: true }), /incompletas/u);
        await M.ServicoPontoRH.adicionarMarcacao({ funcionarioId: 'f-osv', data: '2026-10-12', hora: '19:00', tipo: 'saida', motivo: 'Saída confirmada pelo chefe' }, RH);
        const totais = await M.ServicoPontoRH.fecharMes(OUT.ano, OUT.mes, RH, { converterPendentes: true });
        const osv = totais.find(t => t.funcionario_id === 'f-osv');
        assert.equal(osv.minutos_extra_util, 120);
        assert.equal(osv.faltas_injustificadas, 20, '22 dias úteis, 2 presentes: 20 convertidos em faltas');
        assert.equal(await M.ServicoPontoRH.estadoMes(OUT.ano, OUT.mes), 'fechado');
        await assert.rejects(M.ServicoPontoRH.acao({ celulas: [{ funcionarioId: 'f-osv', data: '2026-10-13' }], acao: 'limpar', motivo: 'Tentativa num mês fechado' }, RH).then(r => { if (r.alteradas) throw new Error('alterou'); throw new Error('fechado'); }), /fechado/u);
        await assert.rejects(M.ServicoTempoRH.registarAusencias({ funcionarios: ['f-joao'], tipo_id: 'ausencia-D', data_inicio: '2026-10-20', data_fim: '2026-10-20' }, RH), /fechado/u);
        const salario = await M.ServicoPontoRH.totaisSalario(OUT.ano, OUT.mes);
        assert.equal(salario.fechado, true);
        assert.equal(salario.totais.get('f-osv').minutos_extra_util, 120);
        // Reabertura com o salário já calculado: fica desactualizado.
        db.prepare(`INSERT INTO rh_processamento (id, ano, mes, tipo, estado, criado_em) VALUES ('p1', 2026, 10, 'normal', 'calculado', ?)`).run(new Date().toISOString());
        await assert.rejects(M.ServicoPontoRH.reabrirMes(OUT.ano, OUT.mes, 'x', RH), /motivo/u);
        const r = await M.ServicoPontoRH.reabrirMes(OUT.ano, OUT.mes, 'Correcção pedida pela contabilidade', RH);
        assert.equal(r.processamentoDesactualizado, true);
        assert.equal(db.prepare(`SELECT processamento_desactualizado FROM rh_ponto_periodo WHERE id = '2026-10'`).get().processamento_desactualizado, 1);
    } finally { db.close(); }
});

test('o processamento salarial só lê meses fechados quando a empresa o exige', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        assert.deepEqual(await M.ServicoPontoRH.totaisSalario(2026, 9).then(r => [r.totais, r.exigeFecho]), [null, true]);
        db.prepare(`UPDATE rh_parametro SET valor = '0' WHERE chave = 'ponto_exigir_fecho_para_salarios'`).run();
        const r = await M.ServicoPontoRH.totaisSalario(2026, 9);
        assert.equal(r.totais.get('f-osv').pendentes, 21, 'Setembro de 2026: 22 dias de semana menos o feriado de 17');
    } finally { db.close(); }
});

test('importação do relógio: o mesmo ficheiro duas vezes não duplica', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        const csv = 'N.º;Data;Entrada;Saída\n0001;2026-10-14;08:05;17:10\n9999;2026-10-14;08:00;17:00\n0003;14/10/2026;07:58;16:00\n';
        const previa = await M.ServicoPontoRH.previsualizarImportacao(csv, M.MAPEAMENTO_ANTERIOR);
        assert.deepEqual(previa.map(l => l.estado), ['valida', 'valida', 'funcionario_desconhecido', 'funcionario_desconhecido', 'valida', 'valida']);
        const r = await M.ServicoPontoRH.importar(previa, {}, RH);
        assert.equal(r.importadas, 4);
        const segunda = await M.ServicoPontoRH.previsualizarImportacao(csv, M.MAPEAMENTO_ANTERIOR);
        assert.equal(segunda.filter(l => l.estado === 'duplicada').length, 4);
        await M.ServicoPontoRH.importar(previa, {}, RH);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rh_marcacao').get().n, 4);
    } finally { db.close(); }
});

test('justificação pelo funcionário: aprovada, a falta passa a justificada; rejeitar exige comentário', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        await M.ServicoPontoRH.acao({ celulas: [{ funcionarioId: 'f-osv', data: '2026-10-15' }], acao: 'falta' }, RH);
        const f = db.prepare(`SELECT * FROM rh_funcionario WHERE id = 'f-osv'`).get();
        const anexo = { nome: 'atestado.pdf', dataUrl: `data:application/pdf;base64,${Buffer.from('%PDF-1.4').toString('base64')}` };
        await assert.rejects(M.ServicoPontoRH.pedirJustificacao(f, { data_inicio: '2026-10-15', data_fim: '2026-10-15', motivo_codigo: 'doenca', motivo: 'Gripe', anexo }, CHEFE), /suas faltas/u);
        const id = await M.ServicoPontoRH.pedirJustificacao(f, { data_inicio: '2026-10-15', data_fim: '2026-10-15', motivo_codigo: 'doenca', motivo: 'Estive doente com febre', anexo }, FUNC);
        assert.equal(db.prepare(`SELECT userId FROM notifications WHERE id = ?`).get(`justificacao:${id}`).userId, CHEFE.id, 'o chefe é avisado');
        const { grelha } = await M.ServicoPontoRH.grelha(2026, 10);
        assert.equal(grelha.linhas.find(l => l.funcionario.id === 'f-osv').dias.find(d => d.data === '2026-10-15').ausencia_pendente, true);
        await assert.rejects(M.ServicoPontoRH.decidirJustificacao(id, false, '', CHEFE), /rejeição/u);
        await M.ServicoPontoRH.decidirJustificacao(id, true, '', CHEFE);
        const falta = db.prepare(`SELECT tipo_id FROM rh_ausencia WHERE funcionario_id = 'f-osv' AND data_inicio = '2026-10-15'`).get();
        assert.equal(falta.tipo_id, 'ausencia-DOE');
        assert.equal(db.prepare(`SELECT title FROM notifications WHERE id = ?`).get(`justificacao-decisao:${id}`).title, 'Justificação aprovada');
    } finally { db.close(); }
});

test('quiosque: PIN único por empresa e marcações pela ordem certa; o portal só marca quando activo', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        await M.ServicoPontoRH.definirPin('f-osv', '4321', RH);
        await assert.rejects(M.ServicoPontoRH.definirPin('f-joao', '4321', RH), /outro funcionário/u);
        const f = await M.ServicoPontoRH.identificarPorPin('4321');
        assert.equal(f.id, 'f-osv');
        assert.equal(await M.ServicoPontoRH.identificarPorPin('0000'), null);
        await M.ServicoPontoRH.marcarNoQuiosque(f, 'entrada', null, 'tablet-entrada', RH);
        await assert.rejects(M.ServicoPontoRH.marcarNoQuiosque(f, 'entrada', null, 'tablet-entrada', RH), /não segue/u);
        assert.deepEqual(M.ServicoPontoRH.proximasAccoes([{ tipo: 'entrada', data_hora: '2026-11-18T08:00' }]), ['saida', 'inicio_pausa']);
        await assert.rejects(M.ServicoPontoRH.marcarPeloPortal(f, 'saida', {}, FUNC), /não está activa/u);
        db.prepare(`UPDATE rh_parametro SET valor = '1' WHERE chave IN ('ponto_autoregisto_app', 'ponto_exigir_geolocalizacao')`).run();
        db.prepare(`UPDATE rh_parametro SET valor = '-8.8383' WHERE chave = 'ponto_local_latitude'`).run();
        db.prepare(`UPDATE rh_parametro SET valor = '13.2344' WHERE chave = 'ponto_local_longitude'`).run();
        await assert.rejects(M.ServicoPontoRH.marcarPeloPortal(f, 'saida', { latitude: -8.85, longitude: 13.25 }, FUNC), /local de trabalho/u);
        await M.ServicoPontoRH.marcarPeloPortal(f, 'saida', { latitude: -8.8384, longitude: 13.2345 }, FUNC);
        const hoje = M.luandaTodayKey();
        assert.deepEqual(marcacoesDe(db, 'f-osv', hoje).map(m => [m.tipo, m.origem]), [['entrada', 'quiosque'], ['saida', 'app']]);
    } finally { db.close(); }
});

test('férias aprovadas depois de uma falta: a falta é anulada automaticamente', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        await M.ServicoPontoRH.acao({ celulas: [{ funcionarioId: 'f-joao', data: '2026-10-21' }], acao: 'falta' }, RH);
        await M.ServicoTempoRH.registarAusencias({ funcionarios: ['f-joao'], tipo_id: 'ausencia-FE', data_inicio: '2026-10-19', data_fim: '2026-10-23' }, RH);
        const estados = db.prepare(`SELECT tipo_id, estado FROM rh_ausencia WHERE funcionario_id = 'f-joao' ORDER BY criado_em`).all().map(a => [a.tipo_id, a.estado]);
        assert.deepEqual(estados, [['ausencia-F', 'anulada'], ['ausencia-FE', 'aprovada']]);
    } finally { db.close(); }
});

test('configuração: guardar duas vezes no mesmo dia actualiza o mesmo valor', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        await M.ServicoPontoRH.guardarConfiguracao({ tolerancia_entrada_min: 5 }, RH);
        await M.ServicoPontoRH.guardarConfiguracao({ tolerancia_entrada_min: 7, tolerancia_cumulativa: true }, RH);
        const versoes = db.prepare(`SELECT valor, vigencia_inicio, vigencia_fim FROM rh_parametro WHERE chave = 'ponto_tolerancia_entrada_min' ORDER BY vigencia_inicio`).all();
        assert.deepEqual(versoes.map(v => v.valor), ['10', '7']);
        assert.ok(versoes[0].vigencia_fim, 'a versão anterior fica com fim de vigência');
    } finally { db.close(); }
});
