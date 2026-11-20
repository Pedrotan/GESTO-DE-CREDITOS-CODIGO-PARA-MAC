import { createRequire } from 'node:module';
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
                export { ServicoDocumentosRH, pastaDoDocumento } from '@/servicos/rh/ServicoDocumentosRH';
                export { crc32, criarZip } from '@/bibliotecas/rh/zip-simples';
                export { gerarAlertas } from '@/bibliotecas/rh/alertas-rh';
                export { aplicarModelo, variaveisDesconhecidas, MODELO_DECLARACAO_SERVICO } from '@/bibliotecas/rh/modelos-rh';
                export { gerarRelatorioPessoal } from '@/componentes/rh/relatorios-pessoais';
                export { arquivarPdf } from '@/componentes/rh/accoes-funcionario';
                export { ServicoModelosRH } from '@/servicos/rh/ServicoModelosRH';
                export { regraLeituraRH, carregamentoPortalPermitido } from '@/bibliotecas/rh/permissoes-rh';
                export { ABAS_RH } from '@/componentes/rh/comum-rh';
                export { ServicoReclamacoesRH } from '@/servicos/rh/ServicoReclamacoesRH';
                export { ServicoRecebimentoRH, ultimaPorRecibo } from '@/servicos/rh/ServicoRecebimentoRH';
                export { ServicoPortalComunicacao, destinatariosRH } from '@/servicos/rh/ServicoPortalComunicacao';
                export { ServicoPortalRH } from '@/servicos/rh/ServicoPortalRH';
                export { ServicoContaPortal } from '@/servicos/rh/ServicoContaPortal';
                export { isPortalPedidoSql } from '@/bibliotecas/rh/portal-sql';
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

const require_bcrypt = () => createRequire(import.meta.url)('bcryptjs');
const RH = { id: 'u-rh', name: 'Rita RH', role: 'super_admin' };

async function createDatabase(M, valorFalta = '0') {
    const { RENDERER_SQL_ALLOWLIST } = await import('../electron/renderer-sql-allowlist.ts');
    const database = new DatabaseSync(':memory:');
    database.exec(`CREATE TABLE audit_logs (id TEXT PRIMARY KEY, timestamp TEXT, userId TEXT, userName TEXT, action TEXT, entity TEXT, details TEXT, previousState TEXT, newState TEXT, metadata TEXT)`);
    for (const sql of [...M.E.RH_FASE1_SQL, ...M.E.RH_FASE2_SQL, ...M.E.RH_PONTO_V2_SQL, ...M.E.RH_PONTO_V3_SQL, ...M.RH_SALARIOS_SCHEMA_SQL, ...M.E.RH_DOCS_SQL, ...M.E.RH_FASE4_SQL, ...M.E.RH_MODELOS_SQL, ...M.E.RH_PORTAL_V2_SQL, ...M.E.RH_HIERARQUIA_SQL]) database.exec(sql);
    database.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, username TEXT UNIQUE, password TEXT, role TEXT, avatar TEXT, createdAt TEXT, permissions TEXT, status TEXT, mustChangePassword INTEGER DEFAULT 0)`);
    database.exec(`CREATE TABLE notifications (id TEXT PRIMARY KEY, userId TEXT, title TEXT NOT NULL, message TEXT NOT NULL, type TEXT NOT NULL, source TEXT DEFAULT 'system', read INTEGER DEFAULT 0, timestamp TEXT NOT NULL)`);
    database.prepare(M.E.RH_SEED_MODELO_SQL).run('modelo-declaracao-servico', 'Declaração de serviço', 'DECLARAÇÃO DE SERVIÇO E SALÁRIO', M.MODELO_DECLARACAO_SERVICO, new Date().toISOString());
    for (const [table, column, definition] of [...M.E.RH_PONTO_V2_COLUNAS, ...M.E.RH_PONTO_V3_COLUNAS, ...M.E.RH_FOLHA_COLUNAS, ...M.E.RH_CADASTRO_COLUNAS, ...M.E.RH_CATALOGO_COLUNAS, ...M.E.RH_DOCS_COLUNAS, ...M.E.RH_HIERARQUIA_COLUNAS]) { try { database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); } catch { /* já existe */ } }
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

test('hierarquia: secções, nível do cargo, secção do funcionário e chefe directo sem ciclos', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        const dep = await M.ServicoRH.guardarDepartamento({ nome: 'Finanças' }, RH);
        const dir = await M.ServicoRH.guardarCargo({ nome: 'Director', departamento_id: dep, nivel: 1 }, RH);
        const tec = await M.ServicoRH.guardarCargo({ nome: 'Técnico', departamento_id: dep, nivel: 4 }, RH);
        await assert.rejects(M.ServicoRH.guardarCargo({ nome: 'X', nivel: 9 }, RH), /Nível/u);
        assert.deepEqual((await M.ServicoRH.cargos()).map(c => [c.nome, c.nivel]).sort(), [['Director', 1], ['Técnico', 4]]);
        const base = { data_admissao: '2026-02-01', estado: 'activo', vinculo: 'Pessoal do Quadro', carreira: 'Geral - Pessoal Técnico', departamento_id: dep };
        const ana = await M.ServicoRH.criarFuncionario({ ...base, numero_mecanografico: '10', nome: 'Ana Directora', iban: 'AO06004000002610435010128', cargo_id: dir }, null, RH);
        const cont = await M.ServicoRH.guardarSeccao({ departamento_id: dep, nome: 'Contabilidade', responsavel_id: ana }, RH);
        await assert.rejects(M.ServicoRH.guardarSeccao({ departamento_id: dep, nome: 'contabilidade' }, RH), /Já existe/u);
        const bruno = await M.ServicoRH.criarFuncionario({ ...base, numero_mecanografico: '11', nome: 'Bruno Técnico', iban: 'AO06000600009202770530191', cargo_id: tec, seccao_id: cont, chefe_id: ana }, null, RH);
        assert.equal(db.prepare('SELECT seccao_id FROM rh_funcionario WHERE id = ?').get(bruno).seccao_id, cont);
        // Ana não pode passar a responder ao Bruno (que já responde à Ana).
        const fichaAna = await M.ServicoRH.funcionario(ana);
        await assert.rejects(M.ServicoRH.actualizarFuncionario(ana, { ...fichaAna, chefe_id: bruno }, RH), /ciclo/u);
        // Mudar de departamento tira a secção (que é de outro departamento).
        const outro = await M.ServicoRH.guardarDepartamento({ nome: 'Logística' }, RH);
        const fichaBruno = await M.ServicoRH.funcionario(bruno);
        await M.ServicoRH.actualizarFuncionario(bruno, { ...fichaBruno, departamento_id: outro, seccao_id: cont }, RH);
        assert.equal(db.prepare('SELECT seccao_id FROM rh_funcionario WHERE id = ?').get(bruno).seccao_id, null);
        assert.equal((await M.ServicoRH.seccoes()).length, 1);
    } finally { db.close(); }
});

test('portal: criar acesso a partir da ficha gera utilizador pelo nome, senha temporária e troca obrigatória', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        const id = await registar(M);
        const ficha = await M.ServicoRH.funcionario(id);
        const c = await M.ServicoContaPortal.criar(ficha, RH, [{ username: 'pedro.de.morais.tango' }]);
        assert.equal(c.username, 'pedro.de.morais.tango2');
        const u = db.prepare('SELECT * FROM users WHERE id = ?').get(c.id);
        assert.deepEqual([u.role, u.status, u.mustChangePassword, JSON.parse(u.permissions)], ['employee', 'active', 1, ['hr_self', 'rh_portal.ver', 'rh_portal.criar']]);
        assert.notEqual(u.password, c.senha, 'só o hash fica na base');
        assert.ok(require_bcrypt().compareSync(c.senha, u.password));
        assert.equal(db.prepare('SELECT utilizador_id FROM rh_funcionario WHERE id = ?').get(id).utilizador_id, c.id);
        await assert.rejects(M.ServicoContaPortal.criar(await M.ServicoRH.funcionario(id), RH, []), /já tem acesso/u);
        const antes = db.prepare('SELECT password FROM users WHERE id = ?').get(c.id).password;
        db.prepare('UPDATE users SET mustChangePassword = 0 WHERE id = ?').run(c.id);
        const r = await M.ServicoContaPortal.reporSenha(await M.ServicoRH.funcionario(id), RH);
        const depois = db.prepare('SELECT password, mustChangePassword FROM users WHERE id = ?').get(c.id);
        assert.notEqual(depois.password, antes);
        assert.ok(require_bcrypt().compareSync(r.senha, depois.password));
        assert.equal(depois.mustChangePassword, 1, 'nova senha temporária: troca obrigatória outra vez');
    } finally { db.close(); }
});

test('cadastro: recusa IBAN e n.º repetidos, BI fora do formato, e aceita os campos novos', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        await registar(M);
        const base = { nome: 'Outro Funcionário', data_admissao: '2026-02-01', estado: 'activo', vinculo: 'Pessoal do Quadro', carreira: 'Geral - Pessoal Técnico', cargo_id: 'cargo-x' };
        await assert.rejects(M.ServicoRH.criarFuncionario({ ...base, numero_mecanografico: '1', iban: 'AO06000600009202770530191' }, null, RH), /IBAN .* já pertence a Pedro de Morais Tango/u);
        await assert.rejects(M.ServicoRH.criarFuncionario({ ...base, numero_mecanografico: '99445110', iban: 'AO06004000002610435010128' }, null, RH), /n\.º mecanográfico .* já pertence/u);
        await assert.rejects(M.ServicoRH.criarFuncionario({ ...base, numero_mecanografico: '2', iban: 'AO06004000002610435010128', bi_numero: '12345' }, null, RH), /9 algarismos, 2 letras e 3 algarismos/u);
        const id = await M.ServicoRH.criarFuncionario({ ...base, numero_mecanografico: '2', iban: 'AO06004000002610435010128', bi_numero: '002658949BA031', nif: '002658949BA031',
            nacionalidade: 'Angolana', telefone_alternativo: '923 000 000', provincia: 'Benguela', municipio: 'Lobito' }, null, RH);
        const f = db.prepare('SELECT nacionalidade, telefone_alternativo, provincia, municipio FROM rh_funcionario WHERE id = ?').get(id);
        assert.deepEqual({ ...f }, { nacionalidade: 'Angolana', telefone_alternativo: '923 000 000', provincia: 'Benguela', municipio: 'Lobito' });
        await M.ServicoRH.alterarEstado(id, 'suspenso', 'Processo disciplinar', RH);
        assert.equal(db.prepare('SELECT estado FROM rh_funcionario WHERE id = ?').get(id).estado, 'suspenso');
        await assert.rejects(M.ServicoRH.alterarEstado(id, 'suspenso', '', RH), /motivo/u);
    } finally { db.close(); }
});

test('catálogo de subsídios: valores iguais aos de antes, por dia trabalhado, proporcional às faltas, anual e incidência por confirmar', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        for (const sql of M.E.RH_CATALOGO_MIGRACAO_SQL) db.exec(sql);
        const f = await registar(M);
        const id = await M.ServicoSalariosRH.abrir({ ano: 2026, mes: 10, tipo: 'normal' }, RH);
        await M.ServicoSalariosRH.guardarEntrada(await processamento(M, id), f, { faltas: 2 }, RH);
        await M.ServicoSalariosRH.calcular(await processamento(M, id), RH);
        const antes = db.prepare('SELECT total_abonos_minor, inss_minor, irt_minor, liquido_minor FROM rh_recibo WHERE funcionario_id = ?').get(f);
        // A migração do catálogo não muda nada nos 5 abonos actuais: o mesmo mês dá os mesmos valores.
        assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM rh_rubrica WHERE codigo IN ('RENDA_CASA','ISOLAMENTO','GRATIFICACAO','REPRESENTACAO','REM_SUPLEMENTAR') AND classe = 'abono' AND incidencia_confirmada = 1`).get().n, 5);
        await M.ServicoSalariosRH.calcular(await processamento(M, id), RH);
        assert.deepEqual({ ...db.prepare('SELECT total_abonos_minor, inss_minor, irt_minor, liquido_minor FROM rh_recibo WHERE funcionario_id = ?').get(f) }, { ...antes });

        // Subsídio de alimentação por dia trabalhado (2 faltas em 30 dias = 28 dias) e transporte proporcional às faltas.
        const alim = await M.ServicoRH.guardarRubrica({ nome: 'Subsídio de refeição', tipo: 'abono', classe: 'subsidio', forma: 'fixo', por_dia: 1, valor_padrao_minor: 100_000, incide_inss: 1, incide_irt: 1, periodicidade: 'mensal' }, RH);
        const transp = await M.ServicoRH.guardarRubrica({ nome: 'Subsídio de transporte (catálogo)', codigo: 'SUB_TRP2', tipo: 'abono', classe: 'subsidio', forma: 'fixo', valor_padrao_minor: 3_000_000, proporcional_faltas: 1, incide_inss: 1, incide_irt: 1 }, RH);
        const natal = await M.ServicoRH.guardarRubrica({ nome: 'Gratificação de Dezembro', tipo: 'abono', classe: 'subsidio', forma: 'fixo', valor_padrao_minor: 5_000_000, periodicidade: 'anual', mes_pagamento: 12, incide_inss: 1, incide_irt: 1 }, RH);
        await assert.rejects(M.ServicoRH.guardarRubrica({ nome: 'subsídio de REFEIÇÃO', tipo: 'abono', forma: 'fixo' }, RH), /Já existe/u);
        for (const r of [alim, transp, natal]) await M.ServicoRH.atribuirRubrica(f, { rubrica_id: r, valor_minor: 0, inicio: '2026-01-01' }, RH);
        await M.ServicoSalariosRH.calcular(await processamento(M, id), RH);
        const l = Object.fromEntries(db.prepare(`SELECT r.nome, l.valor_minor, l.quantidade FROM rh_recibo_linha l JOIN rh_rubrica r ON r.id = l.rubrica_id JOIN rh_recibo c ON c.id = l.recibo_id WHERE c.funcionario_id = ?`).all(f).map(x => [x.nome, x]));
        assert.deepEqual([l['Subsídio de refeição'].valor_minor, l['Subsídio de refeição'].quantidade], [2_800_000, 28]);
        assert.equal(l['Subsídio de transporte (catálogo)'].valor_minor, 2_800_000);
        assert.equal(l['Gratificação de Dezembro'], undefined, 'o anual só entra em Dezembro');

        // Incidência por confirmar bloqueia o processamento de quem o tem atribuído.
        const novo = await M.ServicoRH.guardarRubrica({ nome: 'Subsídio de risco', tipo: 'abono', classe: 'subsidio', forma: 'percentagem', percentagem: 0.1, incide_inss: 1, incide_irt: 1, incidencia_confirmada: 0 }, RH);
        await M.ServicoRH.atribuirRubrica(f, { rubrica_id: novo, valor_minor: 0, inicio: '2026-01-01' }, RH);
        await assert.rejects(M.ServicoSalariosRH.calcular(await processamento(M, id), RH), /Defina se incide IRT e INSS em: Subsídio de risco/u);
    } finally { db.close(); }
});

test('gestão documental: pastas pela categoria, novas versões, mover, anular/restaurar, apagar só pelo Super Administrador, acessos e ZIP', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        const f = await registar(M);
        const pdf = 'data:application/pdf;base64,JVBERi0xLjQK';
        const carregar = (extra = {}) => M.ServicoRH.carregarDocumento({ funcionario_id: f, categoria: 'identificacao', nome: 'Bilhete de Identidade', ficheiro_nome: 'bi.pdf', data_url: pdf, ...extra }, 10, RH);
        const v1 = await carregar();
        const v2 = await carregar({ data_validade: '2032-10-16' });
        const docs = await M.ServicoRH.documentos(f);
        assert.deepEqual(docs.map(d => [d.estado, d.versao]).sort(), [['activo', 2], ['substituido', 1]], 'o mesmo nome na mesma pasta é nova versão');
        assert.equal(M.pastaDoDocumento(docs.find(d => d.id === v2)), 'sys:identificacao');
        const pasta = await M.ServicoDocumentosRH.criarPasta(f, 'Processo de admissão', RH);
        await assert.rejects(M.ServicoDocumentosRH.criarPasta(f, 'Contratos', RH), /Já existe/u);
        const actual = (await M.ServicoRH.documentos(f)).find(d => d.id === v2);
        await M.ServicoDocumentosRH.mover(actual, pasta, RH);
        assert.equal(db.prepare('SELECT pasta_id FROM rh_documento WHERE id = ?').get(v2).pasta_id, pasta);
        await M.ServicoRH.arquivarDocumento(v2, RH);
        const anulado = (await M.ServicoRH.documentos(f)).find(d => d.id === v2);
        await assert.rejects(M.ServicoDocumentosRH.apagarDefinitivo(anulado, { id: 'u2', name: 'Gestor', role: 'manager' }), /Super Administrador/u);
        await M.ServicoDocumentosRH.restaurar(anulado, RH);
        assert.equal(db.prepare('SELECT estado FROM rh_documento WHERE id = ?').get(v2).estado, 'activo');
        await assert.rejects(M.ServicoDocumentosRH.apagarDefinitivo((await M.ServicoRH.documentos(f)).find(d => d.id === v2), RH), /Anule primeiro/u);
        await M.ServicoRH.arquivarDocumento(v2, RH);
        await M.ServicoDocumentosRH.apagarDefinitivo((await M.ServicoRH.documentos(f)).find(d => d.id === v2), RH);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rh_documento WHERE id = ?').get(v2).n, 0);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rh_documento_ficheiro WHERE documento_id = ?').get(v2).n, 0);
        await M.ServicoDocumentosRH.registarAcesso(v1, 'ver', RH);
        const accoes = db.prepare('SELECT accao FROM rh_doc_auditoria ORDER BY criado_em').all().map(x => x.accao);
        for (const a of ['carregar', 'mover', 'anular', 'restaurar', 'apagar', 'ver']) assert.ok(accoes.includes(a), `auditoria de ${a}`);
        // ZIP: CRC-32 de referência e assinatura do ficheiro.
        assert.equal(M.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
        const zip = new Uint8Array(await M.criarZip([{ nome: 'a/b.txt', dados: new TextEncoder().encode('ola') }]).arrayBuffer());
        assert.deepEqual([...zip.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
    } finally { db.close(); }
});

test('avisos de validade a 90, 30 e 7 dias (configuráveis)', async () => {
    const M = await loadModules();
    const base = { funcionarios: [{ id: 'f', nome: 'Ana', data_nascimento: null, estado: 'activo', bi_validade: '2027-01-20' }], contratos: [], planos: [], processamentos: [], ausenciasPendentes: 0,
        parametros: { alertaFeriasDias: 5, mesNatal: 11, prazoEntregaDia: 10, alertaPrazosDias: 5, biDiasAviso: 90 } };
    const doc = validade => [{ id: 'd', funcionario_id: 'f', nome: 'Carta de condução', estado: 'activo', data_validade: validade }];
    const ids = (hoje, validade, prazos) => M.gerarAlertas({ ...base, hoje, documentos: doc(validade), parametros: { ...base.parametros, alertasDocumentoDias: prazos } }).filter(a => a.tipo === 'documento').map(a => a.id).sort();
    assert.deepEqual(ids('2026-11-18', '2027-02-10', undefined), ['bi-funcionario:f:2027-01-20:90', 'documento-90:d']);
    assert.deepEqual(ids('2026-11-18', '2026-12-10', undefined), ['bi-funcionario:f:2027-01-20:90', 'documento-30:d']);
    assert.deepEqual(ids('2026-11-18', '2026-11-22', undefined), ['bi-funcionario:f:2027-01-20:90', 'documento-7:d']);
    assert.deepEqual(ids('2026-11-18', '2026-11-22', [15]), ['documento-15:d'], 'com prazo único de 15 dias o BI (63 dias) ainda não avisa');
});

test('modelos de declaração: variáveis, blocos condicionais e variáveis desconhecidas', async () => {
    const M = await loadModules();
    assert.equal(M.aplicarModelo('Declara-se que {{nome}}{{#finalidade}} ({{finalidade}}){{/finalidade}}, BI {{bi}}.', { nome: 'Ana', bi: '' }), 'Declara-se que Ana, BI —.');
    assert.equal(M.aplicarModelo('{{nome}}{{#finalidade}} para {{finalidade}}{{/finalidade}}', { nome: 'Ana', finalidade: 'o banco' }), 'Ana para o banco');
    assert.deepEqual(M.variaveisDesconhecidas('{{nome}} {{salario}} {{#cargo}}x{{/cargo}}'), ['salario']);
});

test('relatórios pessoais: cada tipo gera um PDF e a declaração usa o modelo editado', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        const id = await registar(M);
        const f = await M.ServicoRH.funcionario(id);
        const ctx = { cargos: [], departamentos: [], contratos: await M.ServicoRH.contratos() };
        const settings = { name: 'Bravaldo - Comércio e Serviços, Lda', nif: '5001032771' };
        for (const tipo of ['ficha', 'historico', 'assiduidade', 'ferias']) {
            const r = await M.gerarRelatorioPessoal(tipo, f, ctx, settings, RH, true, { ano: 2026 });
            assert.match(r.pdf.dataUrl, /^data:application\/pdf/u, tipo);
            assert.equal(r.chave, 'relatorios');
        }
        const p = await M.gerarRelatorioPessoal('personalizado', f, ctx, settings, RH, true, { seccoes: ['dados', 'assiduidade'], de: '2026-01-01', ate: '2026-12-31' });
        assert.match(p.pdf.fileName, /^Relatorio-99445110-/u);
        // A declaração usa o texto do modelo editado (com as variáveis preenchidas) e fica numerada.
        await M.ServicoModelosRH.guardar({ id: 'modelo-declaracao-servico', tipo: 'declaracao', nome: 'Declaração de serviço', titulo: 'DECLARAÇÃO', conteudo: 'Declara-se que {{nome}} ({{numero}}) trabalha em {{empresa}}.', activo: 1 }, RH);
        await assert.rejects(M.ServicoModelosRH.guardar({ tipo: 'declaracao', nome: 'Errado', conteudo: 'Olá {{inexistente}}' }, RH), /desconhecidas/u);
        const d = await M.gerarRelatorioPessoal('declaracao', f, ctx, settings, RH, true, { finalidade: 'banco' });
        assert.equal(d.chave, 'declaracoes');
        assert.match(d.nome, /^Declaração de serviço DS/u);
        assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM rh_documento_emitido WHERE modelo = 'declaracao_servico'`).get().n, 1);
        // O PDF real do jsPDF (com «;filename=») é aceite ao guardar na pasta pessoal.
        assert.ok(d.pdf.dataUrl.startsWith('data:application/pdf;filename='), 'o jsPDF inclui o nome do ficheiro no data URL');
        await M.arquivarPdf(id, d.chave, d.nome, d.pdf, d.origem, RH);
        const guardado = db.prepare("SELECT pasta_id, mime FROM rh_documento WHERE origem = 'declaracao'").get();
        assert.deepEqual({ ...guardado }, { pasta_id: 'sys:declaracoes', mime: 'application/pdf' });
    } finally { db.close(); }
});

test('permissões no processo principal: leituras sensíveis e carregamento pelo portal', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        // As leituras que os serviços fazem são classificadas (as outras não).
        const lidas = [];
        const original = globalThis.__testDb.get;
        const originalAll = globalThis.__testDb.all;
        globalThis.__testDb.get = async (sql, v) => { lidas.push(sql); return original(sql, v); };
        globalThis.__testDb.all = async (sql, v) => { lidas.push(sql); return originalAll(sql, v); };
        const f = await registar(M);
        await M.ServicoRH.ficheiroDocumento('x');
        await M.ServicoRH.historicoSalarial(f);
        globalThis.__testDb.get = original; globalThis.__testDb.all = originalAll;
        assert.equal(M.regraLeituraRH(lidas.find(s => s.includes('rh_documento_ficheiro'))).tipo, 'ficheiro_documento');
        assert.equal(M.regraLeituraRH(lidas.find(s => s.includes('rh_historico_salarial'))).tipo, 'salarial_funcionario');
        assert.equal(M.regraLeituraRH('SELECT * FROM rh_recibo WHERE processamento_id = ? ORDER BY nome').tipo, 'salarial');
        assert.equal(M.regraLeituraRH('SELECT * FROM rh_funcionario ORDER BY nome'), null);

        // Carregamento pelo portal: aceite na subpasta Formação em nome próprio; recusado noutra pasta ou confidencial.
        const transaccoes = [];
        const tx = globalThis.__testDb.transaction;
        globalThis.__testDb.transaction = async st => { transaccoes.push(st); return tx(st); };
        const portal = { id: 'u-portal', name: 'Pedro', role: 'operator', permissions: ['hr_self'] };
        const pdf = 'data:application/pdf;base64,JVBERi0xLjQK';
        await M.ServicoRH.carregarDocumento({ funcionario_id: f, categoria: 'academica', nome: 'Certificado', ficheiro_nome: 'c.pdf', data_url: pdf, pasta_id: 'sys:formacao', origem: 'portal' }, 5, portal);
        await M.ServicoRH.carregarDocumento({ funcionario_id: f, categoria: 'contratual', nome: 'Contrato', ficheiro_nome: 'k.pdf', data_url: pdf, pasta_id: 'sys:contratos' }, 5, portal);
        globalThis.__testDb.transaction = tx;
        assert.ok(M.carregamentoPortalPermitido(transaccoes[0], portal.id), 'Formação e certificados: permitido');
        assert.equal(M.carregamentoPortalPermitido(transaccoes[1], portal.id), null, 'Contratos: recusado');
        assert.equal(M.carregamentoPortalPermitido(transaccoes[0], 'outro-utilizador'), null, 'em nome de outro: recusado');
        const comConfidencial = transaccoes[0].map(s => (/^INSERT INTO rh_documento \(/u.test(s.sql) ? { ...s, params: s.params.map((v, i) => (i === 9 ? 1 : v)) } : s));
        assert.equal(M.carregamentoPortalPermitido(comConfidencial, portal.id), null, 'confidencial: recusado');
    } finally { db.close(); }
});

test('critérios: terminar contrato não apaga, abas iguais ao menu lateral e rotas antigas mantidas', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        const f = await registar(M);
        await M.ServicoRH.cessarContrato(f, '2026-11-30', 'Fim do termo', RH);
        const r = db.prepare('SELECT estado, data_saida FROM rh_funcionario WHERE id = ?').get(f);
        assert.deepEqual({ ...r }, { estado: 'cessado', data_saida: '2026-11-30' });
        assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM rh_contrato WHERE funcionario_id = ? AND estado = 'terminado' AND motivo_fim = 'Fim do termo'`).get(f).n, 1);
    } finally { db.close(); }
    const { readFileSync } = await import('node:fs');
    const sidebar = readFileSync(path.join(root, 'src/componentes/layout/Sidebar.tsx'), 'utf8');
    const grupo = sidebar.slice(sidebar.indexOf("label: 'Recursos Humanos'"), sidebar.indexOf("label: 'Lixeira do Sistema'"));
    const menu = [...grupo.matchAll(/path: '(\/rh\/[a-z]+)'/gu)].map(m => m[1]).filter(p => p !== '/rh/portal');
    assert.deepEqual(menu, M.ABAS_RH.map(a => a.path), 'o menu lateral tem as mesmas entradas que as abas');
    const app = readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
    for (const antiga of ['/rh/ferias', '/rh/ausencias', '/rh/calendario', '/rh/processamento', '/rh/recibos', '/rh/documentos']) assert.ok(app.includes(`'${antiga}'`) || app.includes(`"${antiga}"`), `rota ${antiga}`);
    const subs = M.ABAS_RH.flatMap(a => (a.subs || []).map(s => s.path));
    for (const antiga of ['/rh/ausencias', '/rh/calendario', '/rh/recibos']) assert.ok(subs.includes(antiga), `${antiga} está numa aba`);
});

test('dois computadores abrem o mesmo mês: o mesmo identificador; um processamento antigo é unificado e os conflitos ficam resolvidos', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    db.exec(`CREATE TABLE sync_conflicts (id TEXT PRIMARY KEY, entityType TEXT NOT NULL, entityId TEXT, operation TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        createdAt TEXT NOT NULL, resolvedAt TEXT, resolvedBy TEXT, resolutionNote TEXT)`);
    try {
        const f = await registar(M);
        // Abertura automática repetida (outro computador, ou a sincronização a trazer a mesma abertura): um só registo, igual.
        await M.ServicoSalariosRH.abrirAutomatico(2026, 12);
        await M.ServicoSalariosRH.abrirAutomatico(2026, 12);
        const dez = db.prepare(`SELECT id, criado_em, criado_por_nome FROM rh_processamento WHERE ano = 2026 AND mes = 12`).all();
        assert.deepEqual(dez.map(x => ({ ...x })), [{ id: 'rh-proc-normal-2026-12', criado_em: '2026-12-01T00:00:00.000Z', criado_por_nome: 'Abertura automática' }]);
        assert.equal(await M.ServicoSalariosRH.abrir({ ano: 2026, mes: 9, tipo: 'normal' }, RH), 'rh-proc-normal-2026-09');

        // Processamento de Novembro criado pela versão anterior (identificador aleatório), já calculado, com faltas e um conflito.
        db.prepare(`INSERT INTO rh_processamento (id, ano, mes, tipo, estado, criado_em) VALUES ('antigo-uuid', 2026, 11, 'normal', 'aberto', '2026-11-02')`).run();
        const antigo = await processamento(M, 'antigo-uuid');
        await M.ServicoSalariosRH.guardarEntrada(antigo, f, { faltas: 1 }, RH);
        await M.ServicoSalariosRH.calcular(await processamento(M, 'antigo-uuid'), RH);
        db.prepare(`INSERT INTO sync_conflicts (id, entityType, operation, createdAt) VALUES ('c1', 'rh_recibo', '{}', '2026-11-19'), ('c2', 'clients', '{}', '2026-11-19')`).run();

        assert.equal(await M.ServicoSalariosRH.unificarNormais(true), 1);
        const fixo = 'rh-proc-normal-2026-11';
        assert.equal(db.prepare(`SELECT COUNT(*) n FROM rh_processamento WHERE id = 'antigo-uuid'`).get().n, 0);
        assert.equal(db.prepare(`SELECT estado FROM rh_processamento WHERE id = ?`).get(fixo).estado, 'calculado', 'o estado mantém-se');
        assert.equal(db.prepare(`SELECT COUNT(*) n FROM rh_recibo WHERE processamento_id = ?`).get(fixo).n, 1, 'os recibos acompanham');
        assert.deepEqual({ ...db.prepare(`SELECT id, faltas FROM rh_processamento_entrada WHERE processamento_id = ?`).get(fixo) }, { id: `${fixo}:${f}`, faltas: 1 });
        assert.deepEqual(db.prepare(`SELECT id, status FROM sync_conflicts ORDER BY id`).all().map(x => [x.id, x.status]), [['c1', 'accepted'], ['c2', 'pending']],
            'só os conflitos do processamento salarial ficam resolvidos');
        assert.equal(await M.ServicoSalariosRH.unificarNormais(true), 0, 'nada mais a unificar');

        // Depois de unificado, gravar valores do mês e recalcular funciona sem conflitos (upsert pelo funcionário).
        await M.ServicoSalariosRH.guardarEntrada(await processamento(M, fixo), f, { faltas: 2 }, RH);
        await M.ServicoSalariosRH.calcular(await processamento(M, fixo), RH);
        assert.equal(db.prepare(`SELECT faltas FROM rh_processamento_entrada WHERE id = ?`).get(`${fixo}:${f}`).faltas, 2);
    } finally { db.close(); }
});

test('folha de correcção: o funcionário reclama, a aprovação espera pela resposta, e depois de aprovada já não se reclama', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        const f = await registar(M);
        const func = { id: 'u-func', name: 'Pedro Tango', role: 'employee' };
        const id = await M.ServicoSalariosRH.abrir({ ano: 2026, mes: 10, tipo: 'normal' }, RH);
        await M.ServicoSalariosRH.calcular(await processamento(M, id), RH);
        const recibo = db.prepare('SELECT * FROM rh_recibo WHERE funcionario_id = ?').get(f);
        assert.equal((await M.ServicoPortalRH.minhaFolhaCorreccao(f)).length, 1, 'a folha calculada aparece como folha de correcção');
        assert.equal((await M.ServicoPortalRH.meusRecibos(f)).length, 0, 'ainda não é folha final');

        await assert.rejects(M.ServicoReclamacoesRH.reclamar({ funcionario_id: f, processamento_id: id, recibo_id: recibo.id, motivo: 'curto' }, func), /pelo menos 10/u);
        await M.ServicoReclamacoesRH.reclamar({ funcionario_id: f, processamento_id: id, recibo_id: recibo.id, codigo: 'INSS', descricao: 'INSS', valor_minor: recibo.inss_minor,
            motivo: 'O INSS descontado parece maior do que 3% do salário.' }, func);
        // Recibo de outro funcionário ou ficha errada: a base recusa.
        assert.throws(() => db.prepare(`INSERT INTO rh_reclamacao (id, funcionario_id, processamento_id, recibo_id, motivo, criado_em) VALUES ('x', 'outro', ?, ?, 'motivo qualquer', 'agora')`).run(id, recibo.id), /folha de correcção/u);

        await assert.rejects(M.ServicoSalariosRH.aprovar(await processamento(M, id), { ...RH, id: 'u-aprov' }), /por responder/u);
        const [r] = await M.ServicoReclamacoesRH.doProcessamento(id);
        await M.ServicoReclamacoesRH.responder(r, 'recusada', 'O INSS é 3% da base sujeita: está certo.', RH);
        await M.ServicoSalariosRH.aprovar(await processamento(M, id), { ...RH, id: 'u-aprov' });
        assert.equal((await M.ServicoPortalRH.meusRecibos(f)).length, 1, 'aprovada: passa a folha final');
        await assert.rejects(M.ServicoReclamacoesRH.reclamar({ funcionario_id: f, processamento_id: id, recibo_id: recibo.id, motivo: 'Depois de aprovada já não dá.' }, func), /antes da aprovação/u);
        assert.equal(M.isPortalPedidoSql(`INSERT INTO rh_reclamacao (id, funcionario_id, processamento_id, recibo_id, codigo, descricao, valor_minor, motivo, estado, criado_em, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?)`), true);
        assert.equal(M.isPortalPedidoSql(`INSERT INTO rh_reclamacao (id, funcionario_id, processamento_id, recibo_id, codigo, descricao, valor_minor, motivo, estado, criado_em, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aceite', ?, ?, ?)`), false, 'o funcionário não decide a própria reclamação');
    } finally { db.close(); }
});

test('recepção do salário: só depois de pago, só do próprio recibo, e a última confirmação vale', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        const f = await registar(M);
        const func = { id: 'u-func', name: 'Pedro Tango', role: 'employee' };
        const id = await M.ServicoSalariosRH.abrir({ ano: 2026, mes: 10, tipo: 'normal' }, RH);
        await M.ServicoSalariosRH.calcular(await processamento(M, id), RH);
        const recibo = db.prepare('SELECT * FROM rh_recibo WHERE funcionario_id = ?').get(f);
        const confirmar = (estado, observacao) => M.ServicoRecebimentoRH.confirmar({ funcionario_id: f, recibo_id: recibo.id, processamento_id: id, estado, observacao }, func);
        await M.ServicoSalariosRH.aprovar(await processamento(M, id), { ...RH, id: 'u-aprov' });
        await assert.rejects(confirmar('recebido'), /depois de pago/u, 'aprovado mas ainda não pago');
        // Pagamento marcado directamente (o lançamento contabilístico é testado à parte).
        db.prepare(`UPDATE rh_processamento SET estado = 'pago', pago_por = 'u-aprov', pago_em = 'agora' WHERE id = ?`).run(id);
        await assert.rejects(confirmar('nao_recebido', ''), /Diga ao RH/u);
        await confirmar('nao_recebido', 'Ainda não entrou na conta.');
        await confirmar('recebido');
        const ultima = M.ultimaPorRecibo(await M.ServicoRecebimentoRH.doProcessamento(id)).get(recibo.id);
        assert.equal(ultima.estado, 'recebido', 'a confirmação mais recente vale');
        assert.throws(() => db.prepare(`INSERT INTO rh_recebimento (id, funcionario_id, recibo_id, processamento_id, estado, criado_em) VALUES ('x', 'outro', ?, ?, 'recebido', 'agora')`).run(recibo.id, id), /seu próprio salário/u);
        assert.throws(() => db.prepare(`UPDATE rh_recebimento SET estado = 'nao_recebido'`).run(), /não se altera/u);
        assert.equal(M.isPortalPedidoSql('INSERT INTO rh_recebimento (id, funcionario_id, recibo_id, processamento_id, estado, observacao, criado_em, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'), true);
    } finally { db.close(); }
});

test('portal: pedido de subsídio avisa o RH e o principal; a resposta avisa o funcionário; correio nos dois sentidos', async () => {
    const M = await loadModules();
    const db = await createDatabase(M);
    try {
        const fid = await registar(M);
        const f = (await M.ServicoRH.funcionarios()).find(x => x.id === fid);
        const func = { id: 'u-func', name: 'Pedro Tango', role: 'employee' };
        const users = [{ id: 'gestor', role: 'hr_manager' }, { id: 'principal', role: 'super_admin' }, { id: 'outro-admin', role: 'super_admin' }, { id: 'caixa', role: 'cashier' }, { id: 'u-func', role: 'employee' }];
        const dest = M.destinatariosRH(users, 'principal');
        assert.deepEqual(dest.sort(), ['gestor', 'principal'], 'o RH e o Administrador principal (não os outros)');

        await M.ServicoPortalComunicacao.pedir(f, { tipo: 'subsidio_ferias', ano: 2026, descricao: 'Vou gozar em Dezembro.' }, func, dest);
        const avisos = db.prepare('SELECT userId, title FROM notifications ORDER BY userId').all().map(x => [x.userId, x.title]);
        assert.deepEqual(avisos, [['gestor', 'Pedido de Pedro de Morais Tango'], ['principal', 'Pedido de Pedro de Morais Tango']]);
        const [pedido] = await M.ServicoPortalComunicacao.meusPedidos(fid);
        assert.equal(pedido.assunto, 'Subsídio de férias 2026');
        await M.ServicoPortalComunicacao.responderPedido(pedido, 'aprovado', 'Entra no processamento de Dezembro.', RH, 'u-func');
        assert.equal((await M.ServicoPortalComunicacao.meusPedidos(fid))[0].estado, 'aprovado');
        assert.equal(db.prepare(`SELECT COUNT(*) n FROM notifications WHERE userId = 'u-func'`).get().n, 1, 'o funcionário é avisado da resposta');

        await M.ServicoPortalComunicacao.escreverAoRH(f, 'Dúvida', 'Quando sai o recibo?', func, dest);
        await M.ServicoPortalComunicacao.escreverAoFuncionario(fid, 'Re: Dúvida', 'No dia 25.', RH, 'u-func');
        const correio = await M.ServicoPortalComunicacao.correioDoFuncionario(fid);
        assert.deepEqual(correio.map(m => m.sentido).sort(), ['para_funcionario', 'para_rh']);
        const recebida = correio.find(m => m.sentido === 'para_funcionario');
        await M.ServicoPortalComunicacao.marcarLida(recebida.id);
        assert.equal((await M.ServicoPortalComunicacao.correioDoFuncionario(fid)).find(m => m.id === recebida.id).lida, 1);

        assert.equal(M.isPortalPedidoSql(`INSERT INTO rh_pedido (id, funcionario_id, tipo, ano, assunto, descricao, estado, criado_em, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?)`), true);
        assert.equal(M.isPortalPedidoSql(`INSERT INTO rh_correio (id, funcionario_id, sentido, assunto, corpo, resposta_a, criado_em, de_id, de_nome) VALUES (?, ?, 'para_rh', ?, ?, ?, ?, ?, ?)`), true);
        assert.equal(M.isPortalPedidoSql(`INSERT INTO rh_correio (id, funcionario_id, sentido, assunto, corpo, resposta_a, criado_em, de_id, de_nome) VALUES (?, ?, 'para_funcionario', ?, ?, ?, ?, ?, ?)`), false, 'o funcionário não escreve em nome do RH');
    } finally { db.close(); }
});
