// Esquema do módulo de Recursos Humanos. Cada empresa tem a sua base de dados (e o seu inquilino na nuvem),
// por isso as tabelas não levam empresa_id. Valores em dinheiro em cêntimos (sufixo _minor), como no resto
// do sistema; taxas em fracção (0.03 = 3%). Datas em texto ISO (aaaa-mm-dd). As tabelas sincronizam pela nuvem
// como as restantes (operações da allowlist); os valores iniciais usam ids fixos para não duplicarem entre
// computadores da mesma empresa.

export const RH_FASE1_SQL = [
    `CREATE TABLE IF NOT EXISTS rh_departamento (
        id TEXT PRIMARY KEY, nome TEXT NOT NULL, responsavel_id TEXT, activo INTEGER NOT NULL DEFAULT 1,
        criado_em TEXT NOT NULL, criado_por TEXT, actualizado_em TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS rh_cargo (
        id TEXT PRIMARY KEY, nome TEXT NOT NULL, departamento_id TEXT, salario_referencia_minor INTEGER NOT NULL DEFAULT 0,
        activo INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL, criado_por TEXT, actualizado_em TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS rh_funcionario (
        id TEXT PRIMARY KEY, numero_mecanografico TEXT NOT NULL, nome TEXT NOT NULL, data_nascimento TEXT, sexo TEXT,
        estado_civil TEXT, nif TEXT, bi_numero TEXT, bi_emissao TEXT, bi_validade TEXT, numero_inss TEXT, morada TEXT,
        telefone TEXT, email TEXT, iban TEXT, banco TEXT, data_admissao TEXT NOT NULL, data_saida TEXT,
        cargo_id TEXT, departamento_id TEXT, horario_id TEXT,
        estado TEXT NOT NULL DEFAULT 'activo' CHECK(estado IN ('activo', 'suspenso', 'cessado')),
        foto_url TEXT, utilizador_id TEXT, reformado INTEGER NOT NULL DEFAULT 0, observacoes TEXT,
        criado_em TEXT NOT NULL, criado_por TEXT, actualizado_em TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_rh_funcionario_numero ON rh_funcionario(numero_mecanografico)`,
    `CREATE TABLE IF NOT EXISTS rh_dependente (
        id TEXT PRIMARY KEY, funcionario_id TEXT NOT NULL, nome TEXT NOT NULL, parentesco TEXT, data_nascimento TEXT,
        criado_em TEXT NOT NULL, criado_por TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS rh_contrato (
        id TEXT PRIMARY KEY, funcionario_id TEXT NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('indeterminado', 'determinado')),
        inicio TEXT NOT NULL, fim TEXT, periodo_experiencia_fim TEXT, salario_base_minor INTEGER NOT NULL CHECK(salario_base_minor >= 0),
        horas_semanais REAL NOT NULL DEFAULT 40, dias_ferias INTEGER NOT NULL DEFAULT 22, documento_id TEXT,
        estado TEXT NOT NULL DEFAULT 'activo' CHECK(estado IN ('activo', 'terminado')), motivo_fim TEXT,
        criado_em TEXT NOT NULL, criado_por TEXT, actualizado_em TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_rh_contrato_funcionario ON rh_contrato(funcionario_id, estado)`,
    `CREATE TABLE IF NOT EXISTS rh_historico_salarial (
        id TEXT PRIMARY KEY, funcionario_id TEXT NOT NULL, contrato_id TEXT, salario_anterior_minor INTEGER,
        salario_novo_minor INTEGER NOT NULL, data_efeito TEXT NOT NULL, motivo TEXT NOT NULL,
        criado_em TEXT NOT NULL, criado_por TEXT, criado_por_nome TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_rh_historico_funcionario ON rh_historico_salarial(funcionario_id, data_efeito)`,
    `CREATE TABLE IF NOT EXISTS rh_rubrica (
        id TEXT PRIMARY KEY, codigo TEXT NOT NULL, nome TEXT NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('abono', 'desconto')),
        forma TEXT NOT NULL DEFAULT 'fixo' CHECK(forma IN ('fixo', 'percentagem', 'quantidade')),
        percentagem REAL NOT NULL DEFAULT 0, incide_inss INTEGER NOT NULL DEFAULT 1, incide_irt INTEGER NOT NULL DEFAULT 1,
        limite_isento_irt_minor INTEGER NOT NULL DEFAULT 0, limite_isento_irt_pct REAL NOT NULL DEFAULT 0,
        conta_contabilistica TEXT, ordem_no_recibo INTEGER NOT NULL DEFAULT 100, sistema INTEGER NOT NULL DEFAULT 0,
        activo INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL, criado_por TEXT, actualizado_em TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_rh_rubrica_codigo ON rh_rubrica(codigo)`,
    `CREATE TABLE IF NOT EXISTS rh_funcionario_rubrica (
        id TEXT PRIMARY KEY, funcionario_id TEXT NOT NULL, rubrica_id TEXT NOT NULL, valor_minor INTEGER NOT NULL DEFAULT 0,
        quantidade REAL NOT NULL DEFAULT 1, inicio TEXT NOT NULL, fim TEXT, criado_em TEXT NOT NULL, criado_por TEXT, actualizado_em TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_rh_funcionario_rubrica ON rh_funcionario_rubrica(funcionario_id)`,
    `CREATE TABLE IF NOT EXISTS rh_parametro (
        id TEXT PRIMARY KEY, chave TEXT NOT NULL, valor TEXT NOT NULL, descricao TEXT,
        vigencia_inicio TEXT NOT NULL, vigencia_fim TEXT, criado_em TEXT NOT NULL, criado_por TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_rh_parametro_chave ON rh_parametro(chave, vigencia_inicio)`,
    `CREATE TABLE IF NOT EXISTS rh_irt_tabela (
        id TEXT PRIMARY KEY, ano INTEGER NOT NULL, lei_referencia TEXT NOT NULL, vigencia_inicio TEXT NOT NULL, vigencia_fim TEXT,
        criado_em TEXT NOT NULL, criado_por TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS rh_irt_escalao (
        id TEXT PRIMARY KEY, tabela_id TEXT NOT NULL, ordem INTEGER NOT NULL, limite_inferior_minor INTEGER NOT NULL,
        limite_superior_minor INTEGER, parcela_fixa_minor INTEGER NOT NULL DEFAULT 0, taxa REAL NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_rh_irt_escalao_tabela ON rh_irt_escalao(tabela_id, ordem)`,
    // Arquivo digital: metadados aqui, o ficheiro em rh_documento_ficheiro (sincronizado em páginas pequenas).
    `CREATE TABLE IF NOT EXISTS rh_documento (
        id TEXT PRIMARY KEY, funcionario_id TEXT NOT NULL, categoria TEXT NOT NULL, nome TEXT NOT NULL,
        ficheiro_nome TEXT NOT NULL, mime TEXT NOT NULL, tamanho INTEGER NOT NULL DEFAULT 0,
        data_emissao TEXT, data_validade TEXT, confidencial INTEGER NOT NULL DEFAULT 0,
        estado TEXT NOT NULL DEFAULT 'activo' CHECK(estado IN ('activo', 'substituido', 'arquivado')), substituido_por TEXT,
        carregado_por TEXT, carregado_por_nome TEXT, criado_em TEXT NOT NULL, actualizado_em TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_rh_documento_funcionario ON rh_documento(funcionario_id, categoria)`,
    `CREATE TABLE IF NOT EXISTS rh_documento_ficheiro (
        documento_id TEXT PRIMARY KEY, data_url TEXT NOT NULL
    )`,
];

export const RH_DATA_INICIAL = '2026-01-01';

/** Parâmetros legais e regras da empresa (valores iniciais, a validar com um contabilista certificado). */
export const RH_PARAMETROS_INICIAIS: Array<{ chave: string; valor: string; descricao: string; inicio?: string }> = [
    { chave: 'inss_trabalhador', valor: '0.03', descricao: 'Contribuição do trabalhador para a Segurança Social (descontada no recibo, deduzida antes do IRT)' },
    { chave: 'inss_empresa', valor: '0.08', descricao: 'Contribuição da entidade empregadora (custo da empresa)' },
    { chave: 'inss_reformado', valor: '0.08', descricao: 'Taxa do trabalhador reformado que volta ao activo' },
    { chave: 'subsidio_ferias_pct', valor: '0.5', descricao: 'Subsídio de férias em fracção do salário base' },
    { chave: 'subsidio_natal_pct', valor: '0.5', descricao: 'Subsídio de Natal em fracção do salário base' },
    { chave: 'subsidio_natal_mes', valor: '11', descricao: 'Mês de pagamento do subsídio de Natal' },
    { chave: 'dias_ferias_ano', valor: '22', descricao: 'Dias úteis de férias por ano' },
    { chave: 'horas_dia', valor: '8', descricao: 'Horário normal (horas por dia)' },
    { chave: 'divisor_dia', valor: '30', descricao: 'Divisor do valor-dia: 30 ou «uteis» (dias úteis do mês)' },
    { chave: 'horas_extra_acrescimo', valor: '0.5', descricao: 'Acréscimo das horas extra em dia útil (0.5 = +50%)' },
    { chave: 'horas_extra_feriado_acrescimo', valor: '1', descricao: 'Acréscimo das horas extra em feriado ou descanso (1 = +100%)' },
    { chave: 'salario_minimo', valor: '100000', descricao: 'Salário mínimo nacional em Kz (confirmar o diploma em vigor)' },
    { chave: 'alerta_ferias_dias', valor: '5', descricao: 'Dias de antecedência do alerta de férias (subsídio)' },
    { chave: 'ferias_conflito_pct', valor: '30', descricao: 'Percentagem máxima de um departamento de férias ao mesmo tempo' },
    { chave: 'documento_max_mb', valor: '2', descricao: 'Tamanho máximo de cada documento do arquivo (MB)' },
    { chave: 'bi_dias_aviso', valor: '90', descricao: 'Clientes: dias antes da validade em que o BI passa a «a expirar»' },
    { chave: 'bi_anos_validade', valor: '10', descricao: 'Clientes: anos de validade sugeridos quando a validade do BI não é preenchida' },
    { chave: 'bi_credito_expirado', valor: 'aviso', descricao: 'Clientes: novo crédito com BI expirado — «aviso» ou «bloqueio»' },
];

/** Tabela do IRT 2026 (Grupo A), Lei n.º 14/25, de 30 de Dezembro (OGE 2026), Anexo I. Valores em cêntimos. */
export const RH_IRT_2026 = {
    id: 'irt-2026', ano: 2026, lei: 'Lei n.º 14/25, de 30 de Dezembro (OGE 2026), Anexo I', inicio: '2026-01-01',
    escaloes: [
        [0, 15_000_000, 0, 0],
        [15_000_000, 20_000_000, 1_250_000, 0.16],
        [20_000_000, 30_000_000, 3_125_000, 0.18],
        [30_000_000, 50_000_000, 4_925_000, 0.19],
        [50_000_000, 100_000_000, 8_725_000, 0.20],
        [100_000_000, 150_000_000, 18_725_000, 0.21],
        [150_000_000, 200_000_000, 29_225_000, 0.22],
        [200_000_000, 250_000_000, 40_225_000, 0.23],
        [250_000_000, 500_000_000, 51_725_000, 0.24],
        [500_000_000, 1_000_000_000, 111_725_000, 0.245],
        [1_000_000_000, null, 234_225_000, 0.25],
    ] as Array<[number, number | null, number, number]>,
};

type RubricaInicial = {
    codigo: string; nome: string; tipo: 'abono' | 'desconto'; forma: 'fixo' | 'percentagem' | 'quantidade';
    inss: number; irt: number; isentoMinor?: number; isentoPct?: number; ordem: number; sistema?: number;
};

/** Catálogo inicial de rubricas. As «sistema» são usadas pelo motor de cálculo e não podem ser apagadas. */
export const RH_RUBRICAS_INICIAIS: RubricaInicial[] = [
    { codigo: 'SAL_BASE', nome: 'Salário base', tipo: 'abono', forma: 'fixo', inss: 1, irt: 1, ordem: 10, sistema: 1 },
    { codigo: 'SUB_TRANSP', nome: 'Subsídio de transporte', tipo: 'abono', forma: 'fixo', inss: 1, irt: 1, isentoMinor: 3_000_000, ordem: 20 },
    { codigo: 'SUB_ALIM', nome: 'Subsídio de alimentação', tipo: 'abono', forma: 'fixo', inss: 1, irt: 1, ordem: 30 },
    { codigo: 'ABONO_FAM', nome: 'Abono de família', tipo: 'abono', forma: 'fixo', inss: 0, irt: 1, isentoPct: 0.05, ordem: 40 },
    { codigo: 'HORAS_EXTRA', nome: 'Horas extra', tipo: 'abono', forma: 'quantidade', inss: 1, irt: 1, ordem: 50, sistema: 1 },
    { codigo: 'PREMIO', nome: 'Prémio', tipo: 'abono', forma: 'fixo', inss: 1, irt: 1, ordem: 60 },
    { codigo: 'SUB_FERIAS', nome: 'Subsídio de férias', tipo: 'abono', forma: 'percentagem', inss: 1, irt: 1, ordem: 70, sistema: 1 },
    { codigo: 'SUB_NATAL', nome: 'Subsídio de Natal', tipo: 'abono', forma: 'percentagem', inss: 1, irt: 1, ordem: 80, sistema: 1 },
    { codigo: 'FALTAS', nome: 'Faltas injustificadas', tipo: 'desconto', forma: 'quantidade', inss: 1, irt: 1, ordem: 100, sistema: 1 },
    { codigo: 'ATRASOS', nome: 'Atrasos', tipo: 'desconto', forma: 'quantidade', inss: 1, irt: 1, ordem: 110, sistema: 1 },
    { codigo: 'ADIANTAMENTO', nome: 'Adiantamento', tipo: 'desconto', forma: 'fixo', inss: 0, irt: 0, ordem: 200 },
    { codigo: 'QUOTA', nome: 'Quota sindical', tipo: 'desconto', forma: 'fixo', inss: 0, irt: 0, ordem: 210 },
    { codigo: 'CREDITO_INT', nome: 'Prestação de crédito interno', tipo: 'desconto', forma: 'fixo', inss: 0, irt: 0, ordem: 220 },
];

export const RH_SEED_PARAMETRO_SQL = `INSERT OR IGNORE INTO rh_parametro (id, chave, valor, descricao, vigencia_inicio, vigencia_fim, criado_em, criado_por)
    VALUES (?, ?, ?, ?, ?, NULL, ?, 'sistema')`;
export const RH_SEED_IRT_TABELA_SQL = `INSERT OR IGNORE INTO rh_irt_tabela (id, ano, lei_referencia, vigencia_inicio, vigencia_fim, criado_em, criado_por)
    VALUES (?, ?, ?, ?, NULL, ?, 'sistema')`;
export const RH_SEED_IRT_ESCALAO_SQL = `INSERT OR IGNORE INTO rh_irt_escalao (id, tabela_id, ordem, limite_inferior_minor, limite_superior_minor, parcela_fixa_minor, taxa)
    VALUES (?, ?, ?, ?, ?, ?, ?)`;
export const RH_SEED_RUBRICA_SQL = `INSERT OR IGNORE INTO rh_rubrica (id, codigo, nome, tipo, forma, percentagem, incide_inss, incide_irt,
    limite_isento_irt_minor, limite_isento_irt_pct, conta_contabilistica, ordem_no_recibo, sistema, activo, criado_em, criado_por)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, NULL, ?, ?, 1, ?, 'sistema')`;

/** Instruções (SQL + parâmetros) que semeiam os valores iniciais; idempotentes. */
export const rhSeedStatements = (now: string) => [
    ...RH_PARAMETROS_INICIAIS.map(p => ({
        sql: RH_SEED_PARAMETRO_SQL,
        params: [`param-${p.chave}-${p.inicio || RH_DATA_INICIAL}`, p.chave, p.valor, p.descricao, p.inicio || RH_DATA_INICIAL, now],
    })),
    { sql: RH_SEED_IRT_TABELA_SQL, params: [RH_IRT_2026.id, RH_IRT_2026.ano, RH_IRT_2026.lei, RH_IRT_2026.inicio, now] },
    ...RH_IRT_2026.escaloes.map(([inferior, superior, parcela, taxa], index) => ({
        sql: RH_SEED_IRT_ESCALAO_SQL,
        params: [`${RH_IRT_2026.id}-${index + 1}`, RH_IRT_2026.id, index + 1, inferior, superior, parcela, taxa],
    })),
    ...RH_RUBRICAS_INICIAIS.map(r => ({
        sql: RH_SEED_RUBRICA_SQL,
        params: [`rubrica-${r.codigo}`, r.codigo, r.nome, r.tipo, r.forma, r.inss, r.irt, r.isentoMinor || 0, r.isentoPct || 0, r.ordem, r.sistema || 0, now],
    })),
];

// ── Fase 2: horários, feriados, livro de ponto, ausências e documentos emitidos ──
export const RH_FASE2_SQL = [
    `CREATE TABLE IF NOT EXISTS rh_horario (
        id TEXT PRIMARY KEY, nome TEXT NOT NULL, entrada TEXT NOT NULL, saida TEXT NOT NULL, intervalo_min INTEGER NOT NULL DEFAULT 60,
        dias_semana TEXT NOT NULL DEFAULT '1,2,3,4,5', tolerancia_min INTEGER NOT NULL DEFAULT 10, activo INTEGER NOT NULL DEFAULT 1,
        criado_em TEXT NOT NULL, criado_por TEXT, actualizado_em TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS rh_feriado (
        id TEXT PRIMARY KEY, data TEXT NOT NULL, nome TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'nacional' CHECK(tipo IN ('nacional', 'empresa')),
        recorrente INTEGER NOT NULL DEFAULT 0, activo INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL, criado_por TEXT
    )`,
    // Um registo por funcionário e dia (id = funcionário:data, igual em todos os computadores).
    `CREATE TABLE IF NOT EXISTS rh_ponto (
        id TEXT PRIMARY KEY, funcionario_id TEXT NOT NULL, data TEXT NOT NULL, entrada TEXT, saida TEXT,
        horas_trabalhadas REAL NOT NULL DEFAULT 0, horas_extra REAL NOT NULL DEFAULT 0, minutos_atraso INTEGER NOT NULL DEFAULT 0,
        origem TEXT NOT NULL DEFAULT 'manual' CHECK(origem IN ('manual', 'importado', 'app')), observacoes TEXT,
        registado_por TEXT, registado_por_nome TEXT, criado_em TEXT NOT NULL, actualizado_em TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_rh_ponto_dia ON rh_ponto(funcionario_id, data)`,
    `CREATE TABLE IF NOT EXISTS rh_tipo_ausencia (
        id TEXT PRIMARY KEY, codigo TEXT NOT NULL, nome TEXT NOT NULL, justificada INTEGER NOT NULL DEFAULT 0, remunerada INTEGER NOT NULL DEFAULT 0,
        desconta_salario INTEGER NOT NULL DEFAULT 1, desconta_ferias INTEGER NOT NULL DEFAULT 0, exige_documento INTEGER NOT NULL DEFAULT 0,
        sistema INTEGER NOT NULL DEFAULT 0, activo INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL, criado_por TEXT, actualizado_em TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS rh_ausencia (
        id TEXT PRIMARY KEY, funcionario_id TEXT NOT NULL, tipo_id TEXT NOT NULL, data_inicio TEXT NOT NULL, data_fim TEXT NOT NULL,
        dias REAL NOT NULL DEFAULT 0, horas REAL NOT NULL DEFAULT 0, motivo TEXT, documento_id TEXT,
        estado TEXT NOT NULL DEFAULT 'pendente' CHECK(estado IN ('pendente', 'aprovada', 'anulada')),
        pedido_dispensa INTEGER NOT NULL DEFAULT 0, aprovado_por TEXT, aprovado_por_nome TEXT, aprovado_em TEXT,
        anulado_por TEXT, anulado_por_nome TEXT, anulado_em TEXT, motivo_anulacao TEXT, documento_emitido_id TEXT,
        criado_em TEXT NOT NULL, criado_por TEXT, criado_por_nome TEXT, actualizado_em TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_rh_ausencia_funcionario ON rh_ausencia(funcionario_id, data_inicio)`,
    `CREATE TABLE IF NOT EXISTS rh_documento_emitido (
        id TEXT PRIMARY KEY, funcionario_id TEXT NOT NULL, modelo TEXT NOT NULL, ano INTEGER NOT NULL, sequencia INTEGER NOT NULL,
        numero TEXT NOT NULL, dados_json TEXT NOT NULL, emitido_por TEXT, emitido_por_nome TEXT, emitido_em TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_rh_documento_emitido_numero ON rh_documento_emitido(modelo, ano, sequencia)`,
];

/** Tipos de ausência iniciais (editáveis; confirmar dias e remuneração de cada licença na Lei Geral do Trabalho). */
export const RH_TIPOS_AUSENCIA_INICIAIS: Array<{ codigo: string; nome: string; justificada: number; remunerada: number; desconta: number; ferias?: number; documento?: number }> = [
    { codigo: 'F', nome: 'Falta injustificada', justificada: 0, remunerada: 0, desconta: 1 },
    { codigo: 'FJ', nome: 'Falta justificada sem remuneração', justificada: 1, remunerada: 0, desconta: 1 },
    { codigo: 'DOE', nome: 'Doença com atestado', justificada: 1, remunerada: 1, desconta: 0, documento: 1 },
    { codigo: 'FAL', nome: 'Falecimento de familiar', justificada: 1, remunerada: 1, desconta: 0 },
    { codigo: 'CAS', nome: 'Casamento', justificada: 1, remunerada: 1, desconta: 0 },
    { codigo: 'L', nome: 'Licença de maternidade / paternidade', justificada: 1, remunerada: 1, desconta: 0, documento: 1 },
    { codigo: 'D', nome: 'Dispensa autorizada', justificada: 1, remunerada: 1, desconta: 0 },
    { codigo: 'FE', nome: 'Férias', justificada: 1, remunerada: 1, desconta: 0, ferias: 1 },
];

/** Feriados nacionais recorrentes (dia e mês); confirmar a lista em vigor. Carnaval e Sexta-feira Santa mudam de data todos os anos. */
export const RH_FERIADOS_INICIAIS: Array<[string, string]> = [
    ['01-01', 'Dia do Ano Novo'],
    ['02-04', 'Dia do Início da Luta Armada de Libertação Nacional'],
    ['03-08', 'Dia Internacional da Mulher'],
    ['03-23', 'Dia da Libertação da África Austral'],
    ['04-04', 'Dia da Paz e da Reconciliação Nacional'],
    ['05-01', 'Dia Internacional do Trabalhador'],
    ['09-17', 'Dia do Fundador da Nação e do Herói Nacional'],
    ['11-02', 'Dia dos Finados'],
    ['11-11', 'Dia da Independência Nacional'],
    ['12-25', 'Dia de Natal e da Família'],
];

export const RH_SEED_TIPO_AUSENCIA_SQL = `INSERT OR IGNORE INTO rh_tipo_ausencia (id, codigo, nome, justificada, remunerada, desconta_salario, desconta_ferias, exige_documento, sistema, activo, criado_em, criado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, 'sistema')`;
export const RH_SEED_FERIADO_SQL = `INSERT OR IGNORE INTO rh_feriado (id, data, nome, tipo, recorrente, activo, criado_em, criado_por)
    VALUES (?, ?, ?, 'nacional', 1, 1, ?, 'sistema')`;
export const RH_SEED_HORARIO_SQL = `INSERT OR IGNORE INTO rh_horario (id, nome, entrada, saida, intervalo_min, dias_semana, tolerancia_min, activo, criado_em, criado_por)
    VALUES ('horario-normal', 'Horário normal (08:00–17:00)', '08:00', '17:00', 60, '1,2,3,4,5', 10, 1, ?, 'sistema')`;

export const rhSeedFase2Statements = (now: string) => [
    ...RH_TIPOS_AUSENCIA_INICIAIS.map(t => ({
        sql: RH_SEED_TIPO_AUSENCIA_SQL,
        params: [`ausencia-${t.codigo}`, t.codigo, t.nome, t.justificada, t.remunerada, t.desconta, t.ferias || 0, t.documento || 0, now],
    })),
    ...RH_FERIADOS_INICIAIS.map(([dia, nome]) => ({ sql: RH_SEED_FERIADO_SQL, params: [`feriado-${dia}`, `2000-${dia}`, nome, now] })),
    { sql: RH_SEED_HORARIO_SQL, params: [now] },
];

// ── Fase 4: plano de férias e alertas ──
export const RH_FASE4_SQL = [
    `CREATE TABLE IF NOT EXISTS rh_plano_ferias (
        id TEXT PRIMARY KEY, funcionario_id TEXT NOT NULL, ano INTEGER NOT NULL, mes_previsto INTEGER CHECK(mes_previsto BETWEEN 1 AND 12),
        data_inicio TEXT, data_fim TEXT, dias REAL NOT NULL DEFAULT 0,
        estado TEXT NOT NULL DEFAULT 'planeado' CHECK(estado IN ('planeado', 'aprovado', 'em_gozo', 'gozado', 'anulado')),
        subsidio_processado INTEGER NOT NULL DEFAULT 0, processamento_id TEXT, ausencia_id TEXT, guia_id TEXT, observacoes TEXT,
        aprovado_por TEXT, aprovado_por_nome TEXT, aprovado_em TEXT, criado_em TEXT NOT NULL, criado_por TEXT, criado_por_nome TEXT, actualizado_em TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_rh_plano_ferias_funcionario ON rh_plano_ferias(funcionario_id, ano)`,
    // Alertas do painel: o id é a chave única (tipo + referência + data), para a tarefa diária nunca duplicar.
    `CREATE TABLE IF NOT EXISTS rh_alerta (
        id TEXT PRIMARY KEY, tipo TEXT NOT NULL, referencia_id TEXT, funcionario_id TEXT, mensagem TEXT NOT NULL, data_alerta TEXT NOT NULL,
        destinatario_perfil TEXT NOT NULL DEFAULT 'rh', prioridade INTEGER NOT NULL DEFAULT 2, accao TEXT,
        estado TEXT NOT NULL DEFAULT 'novo' CHECK(estado IN ('novo', 'lido', 'resolvido')),
        lido_por TEXT, lido_em TEXT, resolvido_por TEXT, resolvido_em TEXT, criado_em TEXT NOT NULL, actualizado_em TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_rh_alerta_estado ON rh_alerta(estado, destinatario_perfil)`,
];

export const RH_PARAMETROS_FASE4: Array<{ chave: string; valor: string; descricao: string }> = [
    { chave: 'prazo_entrega_dia', valor: '10', descricao: 'Dia do mês seguinte até ao qual se entregam o INSS e o IRT (confirmar os prazos em vigor)' },
    { chave: 'alerta_prazos_dias', valor: '5', descricao: 'Dias de antecedência do alerta dos prazos de INSS e IRT' },
];
export const rhSeedFase4Statements = (now: string) => RH_PARAMETROS_FASE4.map(p => ({
    sql: RH_SEED_PARAMETRO_SQL, params: [`param-${p.chave}-${RH_DATA_INICIAL}`, p.chave, p.valor, p.descricao, RH_DATA_INICIAL, now],
}));
