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

// ── Livro de ponto (versão 2): marcações individuais, períodos mensais e configuração ──
// As marcações nunca se apagam: anulam-se com motivo (prova em caso de inspecção ou litígio). O resumo de cada dia
// continua em rh_ponto (calculado pelo motor), para os computadores com a versão anterior o verem.
export const RH_PONTO_V2_SQL = [
    `CREATE TABLE IF NOT EXISTS rh_marcacao (
        id TEXT PRIMARY KEY, funcionario_id TEXT NOT NULL, data TEXT NOT NULL, data_hora TEXT NOT NULL,
        tipo TEXT CHECK(tipo IS NULL OR tipo IN ('entrada', 'saida', 'inicio_pausa', 'fim_pausa')),
        origem TEXT NOT NULL CHECK(origem IN ('manual', 'csv', 'relogio', 'app', 'quiosque')),
        dispositivo_id TEXT, latitude REAL, longitude REAL, foto_data_url TEXT,
        pendente_validacao INTEGER NOT NULL DEFAULT 0, motivo TEXT,
        criado_por TEXT, criado_por_nome TEXT, criado_em TEXT NOT NULL,
        anulada INTEGER NOT NULL DEFAULT 0, motivo_anulacao TEXT, anulada_por TEXT, anulada_por_nome TEXT, anulada_em TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_rh_marcacao_dia ON rh_marcacao(funcionario_id, data)`,
    `CREATE INDEX IF NOT EXISTS idx_rh_marcacao_data ON rh_marcacao(data)`,
    `CREATE TRIGGER IF NOT EXISTS trg_rh_marcacao_delete BEFORE DELETE ON rh_marcacao
        BEGIN SELECT RAISE(ABORT, 'As marcações de ponto não se apagam: anulam-se com motivo'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_rh_marcacao_imutavel BEFORE UPDATE ON rh_marcacao
        WHEN OLD.anulada = 1 OR NEW.data_hora <> OLD.data_hora OR COALESCE(NEW.tipo, '') <> COALESCE(OLD.tipo, '') OR NEW.funcionario_id <> OLD.funcionario_id OR NEW.data <> OLD.data
        BEGIN SELECT RAISE(ABORT, 'Uma marcação de ponto não se altera: anula-se e regista-se outra'); END`,
    // Um registo por mês (id aaaa-mm) e por departamento (id aaaa-mm:departamento) para a validação dos chefes.
    `CREATE TABLE IF NOT EXISTS rh_ponto_periodo (
        id TEXT PRIMARY KEY, ano INTEGER NOT NULL, mes INTEGER NOT NULL, departamento_id TEXT,
        estado TEXT NOT NULL DEFAULT 'aberto' CHECK(estado IN ('aberto', 'em_validacao', 'validado', 'fechado')),
        validado_por TEXT, validado_por_nome TEXT, validado_em TEXT, aprovado_por TEXT, aprovado_por_nome TEXT, aprovado_em TEXT,
        fechado_por TEXT, fechado_por_nome TEXT, fechado_em TEXT,
        reaberto_por TEXT, reaberto_por_nome TEXT, reaberto_em TEXT, motivo_reabertura TEXT,
        resumo_json TEXT, processamento_desactualizado INTEGER NOT NULL DEFAULT 0, criado_em TEXT NOT NULL, actualizado_em TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_rh_ponto_periodo_mes ON rh_ponto_periodo(ano, mes)`,
    // Justificação de uma falta (ou de um dia sem registo) pedida pelo funcionário, com anexo; o chefe ou o RH decide.
    `CREATE TABLE IF NOT EXISTS rh_justificacao (
        id TEXT PRIMARY KEY, funcionario_id TEXT NOT NULL, data_inicio TEXT NOT NULL, data_fim TEXT NOT NULL, ausencia_id TEXT,
        motivo_codigo TEXT NOT NULL, motivo TEXT NOT NULL, anexo_nome TEXT, anexo_mime TEXT, anexo_data_url TEXT,
        estado TEXT NOT NULL DEFAULT 'pendente' CHECK(estado IN ('pendente', 'aprovada', 'rejeitada')),
        comentario TEXT, decidido_por TEXT, decidido_por_nome TEXT, decidido_em TEXT,
        criado_em TEXT NOT NULL, criado_por TEXT, criado_por_nome TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_rh_justificacao_funcionario ON rh_justificacao(funcionario_id, estado)`,
];

/** Colunas acrescentadas às tabelas existentes (resumo do dia, meio dia de falta, justificação pelo funcionário e PIN do quiosque). */
export const RH_PONTO_V2_COLUNAS: Array<[string, string, string]> = [
    ['rh_ponto', 'estado', 'TEXT'], ['rh_ponto', 'minutos_trabalhados', 'INTEGER'], ['rh_ponto', 'minutos_saida_antecipada', 'INTEGER'],
    ['rh_ponto', 'minutos_extra', 'INTEGER'], ['rh_ponto', 'minutos_noturnos', 'INTEGER'], ['rh_ponto', 'incompleto', 'INTEGER'],
    ['rh_ponto', 'editado_manualmente', 'INTEGER'], ['rh_ponto', 'primeira_entrada', 'TEXT'], ['rh_ponto', 'ultima_saida', 'TEXT'],
    ['rh_ponto', 'recalculado_em', 'TEXT'],
    ['rh_ausencia', 'meio_dia', 'TEXT'],
    ['rh_funcionario', 'pin_ponto_hash', 'TEXT'],
];

/** Opções do livro de ponto como parâmetros com vigência (secção 4.6). Os valores legais confirmam-se com a LGT. */
export const RH_PARAMETROS_PONTO: Array<{ chave: string; valor: string; descricao: string }> = [
    { chave: 'ponto_tolerancia_entrada_min', valor: '10', descricao: 'Ponto: atraso até este número de minutos não conta' },
    { chave: 'ponto_tolerancia_saida_min', valor: '5', descricao: 'Ponto: saída antecipada até este número de minutos não conta' },
    { chave: 'ponto_tolerancia_cumulativa', valor: '0', descricao: 'Ponto: 1 = acima da tolerância conta o atraso todo; 0 = só o excesso' },
    { chave: 'ponto_minimo_extra_min', valor: '15', descricao: 'Ponto: horas extra só contam a partir destes minutos por dia' },
    { chave: 'ponto_arredondamento_min', valor: '0', descricao: 'Ponto: arredondamento das horas extra (0, 5, 10 ou 15 minutos)' },
    { chave: 'ponto_pausa_almoco_auto_min', valor: '60', descricao: 'Ponto: pausa descontada sem marcações de pausa (máximo; usa a do horário)' },
    { chave: 'ponto_inicio_noturno', valor: '20:00', descricao: 'Ponto: início do trabalho nocturno (confirmar com a LGT)' },
    { chave: 'ponto_fim_noturno', valor: '06:00', descricao: 'Ponto: fim do trabalho nocturno (confirmar com a LGT)' },
    { chave: 'ponto_limite_extra_diario_min', valor: '120', descricao: 'Ponto: alerta acima destes minutos extra num dia (confirmar com a LGT)' },
    { chave: 'ponto_limite_extra_anual_min', valor: '12000', descricao: 'Ponto: alerta acima destes minutos extra num ano (confirmar com a LGT)' },
    { chave: 'ponto_hora_alerta_sem_marcacao', valor: '08:30', descricao: 'Ponto: hora do alerta «sem marcação de entrada»' },
    { chave: 'ponto_lancar_falta_automatica', valor: '0', descricao: 'Ponto: 1 = permite converter dias sem registo em faltas ao validar o mês' },
    { chave: 'ponto_exigir_fecho_para_salarios', valor: '1', descricao: 'Ponto: 1 = o processamento salarial só usa meses fechados' },
    { chave: 'ponto_autoregisto_app', valor: '0', descricao: 'Ponto: 1 = os funcionários marcam o ponto no portal' },
    { chave: 'ponto_exigir_geolocalizacao', valor: '0', descricao: 'Ponto: 1 = a marcação no portal exige estar na área permitida' },
    { chave: 'ponto_raio_permitido_m', valor: '200', descricao: 'Ponto: raio da área permitida (metros)' },
    { chave: 'ponto_local_latitude', valor: '', descricao: 'Ponto: latitude do local de trabalho' },
    { chave: 'ponto_local_longitude', valor: '', descricao: 'Ponto: longitude do local de trabalho' },
    { chave: 'ponto_exigir_selfie', valor: '0', descricao: 'Ponto: 1 = a marcação no portal exige uma fotografia tirada no momento' },
    { chave: 'ponto_alerta_atrasos_mes', valor: '3', descricao: 'Ponto: alerta a partir deste número de atrasos no mês' },
];

/** Escalas, banco de horas, cartões QR e notificações (versão 3.0.7). */
export const RH_PONTO_V3_SQL = [
    `CREATE TABLE IF NOT EXISTS rh_escala (
        id TEXT PRIMARY KEY, funcionario_id TEXT NOT NULL, data TEXT NOT NULL, horario_id TEXT,
        criado_por TEXT, criado_por_nome TEXT, criado_em TEXT NOT NULL, actualizado_em TEXT
    )`,
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_rh_escala_func_data ON rh_escala(funcionario_id, data)',
    'CREATE INDEX IF NOT EXISTS idx_rh_escala_data ON rh_escala(data)',
    `CREATE TABLE IF NOT EXISTS rh_banco_horas (
        id TEXT PRIMARY KEY, funcionario_id TEXT NOT NULL, data TEXT NOT NULL, minutos INTEGER NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('extra', 'saida_antecipada', 'folga', 'ajuste')), tipo_extra TEXT,
        origem TEXT NOT NULL DEFAULT 'manual', descricao TEXT, anulado INTEGER NOT NULL DEFAULT 0, motivo_anulacao TEXT,
        criado_por TEXT, criado_por_nome TEXT, criado_em TEXT NOT NULL, actualizado_em TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS idx_rh_banco_horas_func ON rh_banco_horas(funcionario_id, data)',
];
export const RH_PONTO_V3_COLUNAS: Array<[string, string, string]> = [
    ['rh_horario', 'tipo', "TEXT DEFAULT 'fixo'"], ['rh_horario', 'ciclo', 'TEXT'], ['rh_horario', 'ciclo_inicio', 'TEXT'],
    ['rh_horario', 'minimo_diario_min', 'INTEGER'], ['rh_horario', 'faixa_inicio', 'TEXT'], ['rh_horario', 'faixa_fim', 'TEXT'],
    ['rh_funcionario', 'banco_horas', 'INTEGER DEFAULT 0'], ['rh_funcionario', 'qr_ponto_hash', 'TEXT'],
];
export const RH_PARAMETROS_PONTO_V3: Array<{ chave: string; valor: string; descricao: string }> = [
    { chave: 'ponto_banco_horas_activo', valor: '0', descricao: 'Ponto: 1 = banco de horas activo (horas extra podem ser compensadas em vez de pagas)' },
    { chave: 'ponto_banco_validade_meses', valor: '6', descricao: 'Ponto: meses para compensar as horas do banco (0 = sem prazo)' },
    { chave: 'ponto_alertas_email', valor: '0', descricao: 'Ponto: 1 = os alertas também seguem por e-mail (precisa do e-mail configurado no servidor)' },
    { chave: 'ponto_email_rh', valor: '', descricao: 'Ponto: e-mail do RH para os alertas do livro de ponto' },
    { chave: 'ponto_notificacoes_ambiente', valor: '1', descricao: 'Ponto: 1 = mostra os avisos do ponto como notificação do Windows/navegador' },
];
export const rhSeedPontoV3Statements = (now: string) => RH_PARAMETROS_PONTO_V3.map(p => ({
    sql: RH_SEED_PARAMETRO_SQL, params: [`param-${p.chave}-${RH_DATA_INICIAL}`, p.chave, p.valor, p.descricao, RH_DATA_INICIAL, now],
}));
export const rhSeedPontoStatements = (now: string) => RH_PARAMETROS_PONTO.map(p => ({
    sql: RH_SEED_PARAMETRO_SQL, params: [`param-${p.chave}-${RH_DATA_INICIAL}`, p.chave, p.valor, p.descricao, RH_DATA_INICIAL, now],
}));

// ── Folha de salário no modelo «Remunerações para Conferência» (versão 3.0.8) ──
/** Enquadramento do funcionário impresso na folha: vínculo, grupo/carreira, categoria, escalão e unidade orgânica. */
export const RH_FOLHA_COLUNAS: Array<[string, string, string]> = [
    ['rh_funcionario', 'vinculo', 'TEXT'], ['rh_funcionario', 'carreira', 'TEXT'], ['rh_funcionario', 'categoria', 'TEXT'],
    ['rh_funcionario', 'escalao', 'TEXT'], ['rh_funcionario', 'unidade_organica', 'TEXT'],
];
/** Abonos habituais da folha (as percentagens são sobre o vencimento base). */
export const RH_RUBRICAS_FOLHA: Array<RubricaInicial & { percentagem: number }> = [
    { codigo: 'RENDA_CASA', nome: 'Renda de casa (30%)', tipo: 'abono', forma: 'percentagem', percentagem: 0.3, inss: 1, irt: 1, ordem: 12 },
    { codigo: 'ISOLAMENTO', nome: 'Isolamento (30%)', tipo: 'abono', forma: 'percentagem', percentagem: 0.3, inss: 1, irt: 1, ordem: 13 },
    { codigo: 'GRATIFICACAO', nome: 'Gratificação (30%)', tipo: 'abono', forma: 'percentagem', percentagem: 0.3, inss: 1, irt: 1, ordem: 14 },
    { codigo: 'REPRESENTACAO', nome: 'Representação (20%)', tipo: 'abono', forma: 'percentagem', percentagem: 0.2, inss: 1, irt: 1, ordem: 15 },
    { codigo: 'REM_SUPLEMENTAR', nome: 'Remuneração suplementar s/ IRT', tipo: 'abono', forma: 'fixo', percentagem: 0, inss: 0, irt: 0, ordem: 16 },
];
export const RH_SEED_RUBRICA_PCT_SQL = `INSERT OR IGNORE INTO rh_rubrica (id, codigo, nome, tipo, forma, percentagem, incide_inss, incide_irt,
    limite_isento_irt_minor, limite_isento_irt_pct, conta_contabilistica, ordem_no_recibo, sistema, activo, criado_em, criado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, 0, 1, ?, 'sistema')`;
export const rhSeedFolhaStatements = (now: string) => RH_RUBRICAS_FOLHA.map(r => ({
    sql: RH_SEED_RUBRICA_PCT_SQL, params: [`rubrica-${r.codigo}`, r.codigo, r.nome, r.tipo, r.forma, r.percentagem, r.inss, r.irt, r.ordem, now],
}));
// ── Cadastro de funcionários (versão 3.0.9) ──
export const RH_CADASTRO_COLUNAS: Array<[string, string, string]> = [
    ['rh_funcionario', 'nacionalidade', 'TEXT'], ['rh_funcionario', 'telefone_alternativo', 'TEXT'], ['rh_funcionario', 'provincia', 'TEXT'],
    ['rh_funcionario', 'municipio', 'TEXT'], ['rh_funcionario', 'chefe_id', 'TEXT'],
];
/** Grupos/regimes de carreira (lista editável nas Configurações, separada por «;») e prazos do período experimental. */
export const RH_PARAMETROS_CADASTRO: Array<{ chave: string; valor: string; descricao: string }> = [
    { chave: 'carreiras', valor: 'Chefia - Regime Geral/Local;Direcção - Regime Geral/Local;Geral - Pessoal Técnico;Geral - Pessoal Não Técnico;Quadro Temporário - Gabinete;Administrativo;Operacional',
        descricao: 'Grupos / regimes de carreira do cadastro de funcionários (separados por ;)' },
    { chave: 'periodo_experimental_dias_indeterminado', valor: '60', descricao: 'Dias do período experimental sugeridos para contratos por tempo indeterminado (confirmar com a Lei Geral do Trabalho)' },
    { chave: 'periodo_experimental_dias_determinado', valor: '30', descricao: 'Dias do período experimental sugeridos para contratos a termo certo (confirmar com a Lei Geral do Trabalho)' },
];
export const rhSeedCadastroStatements = (now: string) => RH_PARAMETROS_CADASTRO.map(p => ({
    sql: RH_SEED_PARAMETRO_SQL, params: [`param-${p.chave}-${RH_DATA_INICIAL}`, p.chave, p.valor, p.descricao, RH_DATA_INICIAL, now],
}));
// ── Catálogo de subsídios e abonos (bloco 5): as rubricas ganham os campos do catálogo ──
export const RH_CATALOGO_COLUNAS: Array<[string, string, string]> = [
    ['rh_rubrica', 'classe', "TEXT"], ['rh_rubrica', 'por_dia', 'INTEGER NOT NULL DEFAULT 0'], ['rh_rubrica', 'valor_padrao_minor', 'INTEGER NOT NULL DEFAULT 0'],
    ['rh_rubrica', 'periodicidade', "TEXT NOT NULL DEFAULT 'mensal'"], ['rh_rubrica', 'mes_pagamento', 'INTEGER'], ['rh_rubrica', 'proporcional_faltas', 'INTEGER NOT NULL DEFAULT 0'],
    ['rh_rubrica', 'auto_atribuir', 'INTEGER NOT NULL DEFAULT 0'], ['rh_rubrica', 'descricao', 'TEXT'], ['rh_rubrica', 'incidencia_confirmada', 'INTEGER NOT NULL DEFAULT 1'],
    ['rh_funcionario_rubrica', 'observacao', 'TEXT'],
];
/** Os 5 abonos da folha passam a «Abono» do catálogo; a incidência já estava definida no código e mantém-se confirmada. */
export const RH_CATALOGO_MIGRACAO_SQL = [
    `UPDATE rh_rubrica SET classe = 'abono' WHERE classe IS NULL AND tipo = 'abono' AND codigo IN ('RENDA_CASA', 'ISOLAMENTO', 'GRATIFICACAO', 'REPRESENTACAO', 'REM_SUPLEMENTAR')`,
    `UPDATE rh_rubrica SET classe = CASE WHEN tipo = 'desconto' THEN 'desconto' ELSE 'abono' END WHERE classe IS NULL`,
];
// ── Gestão documental (bloco 6): pastas pessoais e da empresa, versões, anulados e auditoria de acessos ──
export const RH_DOCS_SQL = [
    `CREATE TABLE IF NOT EXISTS rh_doc_pasta (
        id TEXT PRIMARY KEY, funcionario_id TEXT NOT NULL, nome TEXT NOT NULL, anulada INTEGER NOT NULL DEFAULT 0,
        criado_por TEXT, criado_por_nome TEXT, criado_em TEXT NOT NULL, actualizado_em TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS idx_rh_doc_pasta_funcionario ON rh_doc_pasta(funcionario_id)',
    `CREATE TABLE IF NOT EXISTS rh_doc_auditoria (
        id TEXT PRIMARY KEY, documento_id TEXT NOT NULL, accao TEXT NOT NULL, detalhe TEXT, utilizador_id TEXT, utilizador_nome TEXT, criado_em TEXT NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_rh_doc_auditoria_documento ON rh_doc_auditoria(documento_id, criado_em)',
];
export const RH_DOCS_COLUNAS: Array<[string, string, string]> = [
    ['rh_documento', 'pasta_id', 'TEXT'], ['rh_documento', 'origem', "TEXT NOT NULL DEFAULT 'upload'"], ['rh_documento', 'versao', 'INTEGER NOT NULL DEFAULT 1'],
    ['rh_documento', 'anulado_por', 'TEXT'], ['rh_documento', 'anulado_por_nome', 'TEXT'], ['rh_documento', 'anulado_em', 'TEXT'],
];
export const RH_PARAMETROS_DOCS: Array<{ chave: string; valor: string; descricao: string }> = [
    { chave: 'documento_alertas_dias', valor: '90,30,7', descricao: 'Dias antes da validade de um documento (e do BI) em que se avisa (separados por vírgula)' },
    { chave: 'chefe_ve_documentos', valor: '1', descricao: 'Permissões: 1 = o chefe do departamento vê os documentos (não confidenciais) da sua equipa; 0 = não vê' },
];
export const rhSeedDocsStatements = (now: string) => RH_PARAMETROS_DOCS.map(p => ({
    sql: RH_SEED_PARAMETRO_SQL, params: [`param-${p.chave}-${RH_DATA_INICIAL}`, p.chave, p.valor, p.descricao, RH_DATA_INICIAL, now],
}));
// ── Relatórios pessoais (bloco 7): modelos de declaração e de relatório personalizado ──
export const RH_MODELOS_SQL = [
    `CREATE TABLE IF NOT EXISTS rh_modelo (
        id TEXT PRIMARY KEY, tipo TEXT NOT NULL CHECK(tipo IN ('declaracao', 'relatorio')), nome TEXT NOT NULL, titulo TEXT, conteudo TEXT NOT NULL,
        activo INTEGER NOT NULL DEFAULT 1, sistema INTEGER NOT NULL DEFAULT 0, criado_em TEXT NOT NULL, criado_por TEXT, criado_por_nome TEXT, actualizado_em TEXT
    )`,
];
// Portal do funcionário (2.ª fase): outros pedidos ao RH (ex.: subsídio de férias) e correio interno funcionário ↔ RH.
export const RH_PORTAL_V2_SQL = [
    `CREATE TABLE IF NOT EXISTS rh_pedido (
        id TEXT PRIMARY KEY, funcionario_id TEXT NOT NULL, tipo TEXT NOT NULL CHECK(tipo IN ('subsidio_ferias', 'declaracao', 'outro')),
        ano INTEGER, assunto TEXT NOT NULL, descricao TEXT, estado TEXT NOT NULL DEFAULT 'pendente' CHECK(estado IN ('pendente', 'aprovado', 'recusado')),
        resposta TEXT, criado_em TEXT NOT NULL, criado_por TEXT, criado_por_nome TEXT, respondido_em TEXT, respondido_por TEXT, respondido_por_nome TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_rh_pedido_estado ON rh_pedido(estado, criado_em)`,
    `CREATE TABLE IF NOT EXISTS rh_correio (
        id TEXT PRIMARY KEY, funcionario_id TEXT NOT NULL, sentido TEXT NOT NULL CHECK(sentido IN ('para_rh', 'para_funcionario')),
        assunto TEXT NOT NULL, corpo TEXT NOT NULL, de_id TEXT, de_nome TEXT, lida INTEGER NOT NULL DEFAULT 0, resposta_a TEXT, criado_em TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_rh_correio_funcionario ON rh_correio(funcionario_id, criado_em)`,
];
// Hierarquia (bloco F): secções dentro dos departamentos, nível de cada cargo e a secção de cada funcionário.
export const RH_HIERARQUIA_SQL = [
    `CREATE TABLE IF NOT EXISTS rh_seccao (
        id TEXT PRIMARY KEY, departamento_id TEXT NOT NULL, nome TEXT NOT NULL, responsavel_id TEXT, activo INTEGER NOT NULL DEFAULT 1,
        criado_em TEXT NOT NULL, criado_por TEXT, actualizado_em TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_rh_seccao_departamento ON rh_seccao(departamento_id)`,
];
export const RH_HIERARQUIA_COLUNAS: Array<[string, string, string]> = [
    ["rh_funcionario", "seccao_id", "TEXT"], ["rh_cargo", "nivel", "INTEGER"],
];
export const RH_SEED_MODELO_SQL = `INSERT OR IGNORE INTO rh_modelo (id, tipo, nome, titulo, conteudo, activo, sistema, criado_em, criado_por, criado_por_nome)
    VALUES (?, 'declaracao', ?, ?, ?, 1, 1, ?, 'sistema', 'Sistema')`;
/** BI angolano: 9 algarismos, 2 letras e 3 algarismos (ex.: 002658949BA031). */
export const FORMATO_BI = /^\d{9}[A-Z]{2}\d{3}$/u;
/** Vínculos (o da folha: «Pessoal do Quadro» imprime-se como «Vinc.:», os restantes como «Cargo:»). */
/** Valor de cada falta (Kz); 0 = desconta o valor-dia (salário base ÷ divisor). */
export const RH_PARAMETROS_FALTA: Array<{ chave: string; valor: string; descricao: string }> = [
    { chave: 'valor_falta', valor: '0', descricao: 'Valor descontado por cada falta em Kz (0 = valor-dia: salário base ÷ divisor do dia)' },
];
export const rhSeedFaltaStatements = (now: string) => RH_PARAMETROS_FALTA.map(p => ({
    sql: RH_SEED_PARAMETRO_SQL, params: [`param-${p.chave}-${RH_DATA_INICIAL}`, p.chave, p.valor, p.descricao, RH_DATA_INICIAL, now],
}));
export const RH_VINCULOS = ['Comissão de Serviço', 'Pessoal do Quadro', 'Quadro Temporário', 'Contratado', 'Prestador de Serviços'];
// Calendário laboral e férias por dias úteis: categoria e local dos feriados registados (pontes, tolerâncias,
// feriados locais, datas internacionais) e, no plano de férias, a data de regresso, a aprovação do chefe directo,
// a recusa e a interrupção.
export const RH_CALENDARIO_COLUNAS: Array<[string, string, string]> = [
    ['rh_feriado', 'categoria', 'TEXT'], ['rh_feriado', 'local', 'TEXT'],
    ['rh_plano_ferias', 'data_regresso', 'TEXT'], ['rh_plano_ferias', 'dias_calendario', 'INTEGER'],
    ['rh_plano_ferias', 'chefe_aprovado_por', 'TEXT'], ['rh_plano_ferias', 'chefe_aprovado_por_nome', 'TEXT'], ['rh_plano_ferias', 'chefe_aprovado_em', 'TEXT'],
    ['rh_plano_ferias', 'recusado', 'INTEGER NOT NULL DEFAULT 0'], ['rh_plano_ferias', 'motivo_recusa', 'TEXT'], ['rh_plano_ferias', 'interrompido_em', 'TEXT'],
];
export const RH_PARAMETROS_CALENDARIO: Array<{ chave: string; valor: string; descricao: string }> = [
    { chave: 'pontes_desde_ano', valor: '2027', descricao: 'Ano a partir do qual o calendário gera as pontes (feriado à terça → segunda; à quinta → sexta)' },
    { chave: 'ferias_transitados_max', valor: '0', descricao: 'Máximo de dias de férias que passam para o ano seguinte (0 = sem limite; confirmar com a LGT)' },
    { chave: 'ferias_periodo_minimo', valor: '15', descricao: 'Férias divididas: um dos períodos deve ter pelo menos estes dias úteis (0 = sem regra; confirmar com a LGT)' },
];
export const rhSeedCalendarioStatements = (now: string) => RH_PARAMETROS_CALENDARIO.map(p => ({
    sql: RH_SEED_PARAMETRO_SQL, params: [`param-${p.chave}-${RH_DATA_INICIAL}`, p.chave, p.valor, p.descricao, RH_DATA_INICIAL, now],
}));
