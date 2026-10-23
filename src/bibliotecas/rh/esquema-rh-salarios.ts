// Processamento salarial (fase 3 do RH). As tabelas entram no esquema protegido (como a carteira de crédito) para
// que os triggers garantam na própria base de dados que um mês aprovado, pago ou fechado não muda: os recibos,
// as linhas e as rubricas do mês ficam imutáveis e um processamento fechado não se altera nem se apaga.
// As correcções fazem-se num processamento de acerto no mês seguinte.
export const RH_SALARIOS_SCHEMA_SQL = [
    `CREATE TABLE IF NOT EXISTS rh_processamento (
        id TEXT PRIMARY KEY, ano INTEGER NOT NULL, mes INTEGER NOT NULL CHECK(mes BETWEEN 1 AND 12),
        tipo TEXT NOT NULL CHECK(tipo IN ('normal', 'ferias', 'natal', 'acerto')),
        estado TEXT NOT NULL DEFAULT 'aberto' CHECK(estado IN ('aberto', 'calculado', 'aprovado', 'pago', 'fechado')),
        descricao TEXT, funcionarios_json TEXT, irt_tabela_id TEXT, parametros_json TEXT,
        total_bruto_minor INTEGER NOT NULL DEFAULT 0, total_liquido_minor INTEGER NOT NULL DEFAULT 0, total_inss_trab_minor INTEGER NOT NULL DEFAULT 0,
        total_inss_emp_minor INTEGER NOT NULL DEFAULT 0, total_irt_minor INTEGER NOT NULL DEFAULT 0, total_outros_minor INTEGER NOT NULL DEFAULT 0,
        num_recibos INTEGER NOT NULL DEFAULT 0, calculado_por TEXT, calculado_por_nome TEXT, calculado_em TEXT,
        aprovado_por TEXT, aprovado_por_nome TEXT, aprovado_em TEXT, pago_por TEXT, pago_por_nome TEXT, pago_em TEXT, conta_pagamento TEXT,
        fechado_por TEXT, fechado_por_nome TEXT, fechado_em TEXT, lancamentos_json TEXT,
        criado_em TEXT NOT NULL, criado_por TEXT, criado_por_nome TEXT, actualizado_em TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_rh_processamento_normal ON rh_processamento(ano, mes) WHERE tipo = 'normal'`,
    `CREATE TABLE IF NOT EXISTS rh_recibo (
        id TEXT PRIMARY KEY, processamento_id TEXT NOT NULL, funcionario_id TEXT NOT NULL, numero_recibo TEXT NOT NULL,
        nome TEXT NOT NULL, numero_mecanografico TEXT, cargo TEXT, departamento TEXT, nif TEXT, numero_inss TEXT, iban TEXT, banco TEXT,
        salario_base_minor INTEGER NOT NULL DEFAULT 0, dias_trabalhados REAL NOT NULL DEFAULT 0, valor_dia_minor INTEGER NOT NULL DEFAULT 0,
        valor_hora_minor INTEGER NOT NULL DEFAULT 0, total_abonos_minor INTEGER NOT NULL DEFAULT 0, total_descontos_minor INTEGER NOT NULL DEFAULT 0,
        bruto_minor INTEGER NOT NULL DEFAULT 0, base_inss_minor INTEGER NOT NULL DEFAULT 0, inss_minor INTEGER NOT NULL DEFAULT 0,
        inss_emp_minor INTEGER NOT NULL DEFAULT 0, isento_irt_minor INTEGER NOT NULL DEFAULT 0, base_irt_minor INTEGER NOT NULL DEFAULT 0,
        irt_minor INTEGER NOT NULL DEFAULT 0, escalao_irt INTEGER, outros_descontos_minor INTEGER NOT NULL DEFAULT 0,
        liquido_minor INTEGER NOT NULL DEFAULT 0, custo_empresa_minor INTEGER NOT NULL DEFAULT 0, avisos_json TEXT, resumo_json TEXT,
        criado_em TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_rh_recibo_funcionario ON rh_recibo(processamento_id, funcionario_id)`,
    `CREATE TABLE IF NOT EXISTS rh_recibo_linha (
        id TEXT PRIMARY KEY, recibo_id TEXT NOT NULL, rubrica_id TEXT, codigo TEXT NOT NULL, descricao TEXT NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('abono', 'desconto')), quantidade REAL NOT NULL DEFAULT 1, valor_unitario_minor INTEGER NOT NULL DEFAULT 0,
        valor_minor INTEGER NOT NULL, incide_inss INTEGER NOT NULL DEFAULT 0, incide_irt INTEGER NOT NULL DEFAULT 0,
        isento_irt_minor INTEGER NOT NULL DEFAULT 0, ordem INTEGER NOT NULL DEFAULT 100
    )`,
    `CREATE INDEX IF NOT EXISTS idx_rh_recibo_linha_recibo ON rh_recibo_linha(recibo_id)`,
    // Rubricas variáveis do mês (prémios, adiantamentos), acrescentadas antes da aprovação.
    `CREATE TABLE IF NOT EXISTS rh_rubrica_pontual (
        id TEXT PRIMARY KEY, processamento_id TEXT NOT NULL, funcionario_id TEXT NOT NULL, rubrica_id TEXT NOT NULL,
        quantidade REAL NOT NULL DEFAULT 1, valor_minor INTEGER NOT NULL, descricao TEXT,
        criado_em TEXT NOT NULL, criado_por TEXT, criado_por_nome TEXT
    )`,
    `CREATE TRIGGER IF NOT EXISTS trg_rh_processamento_fechado_update BEFORE UPDATE ON rh_processamento
        WHEN OLD.estado = 'fechado'
        BEGIN SELECT RAISE(ABORT, 'Um processamento salarial fechado não pode ser alterado (faça um acerto no mês seguinte)'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_rh_processamento_delete BEFORE DELETE ON rh_processamento
        WHEN OLD.estado <> 'aberto'
        BEGIN SELECT RAISE(ABORT, 'Só se apaga um processamento ainda aberto'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_rh_recibo_insert BEFORE INSERT ON rh_recibo
        WHEN (SELECT estado FROM rh_processamento WHERE id = NEW.processamento_id) NOT IN ('aberto', 'calculado')
        BEGIN SELECT RAISE(ABORT, 'O processamento já foi aprovado: os recibos não mudam'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_rh_recibo_update BEFORE UPDATE ON rh_recibo
        WHEN (SELECT estado FROM rh_processamento WHERE id = OLD.processamento_id) NOT IN ('aberto', 'calculado')
        BEGIN SELECT RAISE(ABORT, 'O processamento já foi aprovado: os recibos não mudam'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_rh_recibo_delete BEFORE DELETE ON rh_recibo
        WHEN (SELECT estado FROM rh_processamento WHERE id = OLD.processamento_id) NOT IN ('aberto', 'calculado')
        BEGIN SELECT RAISE(ABORT, 'O processamento já foi aprovado: os recibos não mudam'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_rh_recibo_linha_update BEFORE UPDATE ON rh_recibo_linha
        BEGIN SELECT RAISE(ABORT, 'As linhas do recibo não se alteram: recalcule o processamento'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_rh_recibo_linha_delete BEFORE DELETE ON rh_recibo_linha
        WHEN (SELECT p.estado FROM rh_recibo r JOIN rh_processamento p ON p.id = r.processamento_id WHERE r.id = OLD.recibo_id) NOT IN ('aberto', 'calculado')
        BEGIN SELECT RAISE(ABORT, 'O processamento já foi aprovado: os recibos não mudam'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_rh_rubrica_pontual_insert BEFORE INSERT ON rh_rubrica_pontual
        WHEN (SELECT estado FROM rh_processamento WHERE id = NEW.processamento_id) NOT IN ('aberto', 'calculado')
        BEGIN SELECT RAISE(ABORT, 'O processamento já foi aprovado'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_rh_rubrica_pontual_delete BEFORE DELETE ON rh_rubrica_pontual
        WHEN (SELECT estado FROM rh_processamento WHERE id = OLD.processamento_id) NOT IN ('aberto', 'calculado')
        BEGIN SELECT RAISE(ABORT, 'O processamento já foi aprovado'); END`,
];

/** Só as tabelas e índices (para a migração versionada; os triggers vêm do esquema protegido). */
export const RH_FASE3_SQL = RH_SALARIOS_SCHEMA_SQL.filter(sql => !/^\s*CREATE TRIGGER/iu.test(sql));
