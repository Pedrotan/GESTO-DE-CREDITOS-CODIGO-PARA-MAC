// Compliance (fase 1): perfil de conformidade do cliente (KYC), histórico de verificações de identidade, modelos de
// risco versionados, avaliações de risco e revisões de possíveis duplicados.
//
// Regras guardadas na própria base de dados (valem também para registos que chegam pela sincronização):
// - nada se apaga: verificações, avaliações, versões do modelo e revisões de duplicados ficam para sempre;
// - uma verificação decide-se uma só vez e quem a registou não a decide (salvo o Super Administrador);
// - uma avaliação de risco revê-se uma só vez, por outra pessoa, e os números calculados não se alteram;
// - uma versão do modelo de risco não muda de conteúdo (só se activa ou desactiva; alterar = nova versão).
// O cliente continua a ser o da tabela clients: o perfil liga-se pelo mesmo id (não há segunda ficha).

export const COMPLIANCE_FASE1_SQL = [
    `CREATE TABLE IF NOT EXISTS compliance_perfil (
        id TEXT PRIMARY KEY, client_id TEXT NOT NULL UNIQUE,
        profissao TEXT, entidade_empregadora TEXT, origem_fundos TEXT, finalidade_credito TEXT,
        pep INTEGER CHECK(pep IN (0, 1) OR pep IS NULL), pep_funcao TEXT,
        pep_relacao TEXT CHECK(pep_relacao IN ('proprio', 'familiar', 'associado') OR pep_relacao IS NULL),
        beneficiario_efectivo TEXT, documentos_entregues TEXT, observacoes TEXT,
        estado_kyc TEXT NOT NULL DEFAULT 'pendente' CHECK(estado_kyc IN ('pendente', 'em_verificacao', 'verificado', 'recusado')),
        kyc_verificado_em TEXT, kyc_verificado_por TEXT, kyc_verificado_por_nome TEXT,
        nivel_risco TEXT CHECK(nivel_risco IN ('baixo', 'medio', 'elevado') OR nivel_risco IS NULL), pontuacao_risco INTEGER,
        diligencia TEXT CHECK(diligencia IN ('simplificada', 'normal', 'reforcada') OR diligencia IS NULL),
        avaliacao_id TEXT, proxima_revisao TEXT,
        criado_em TEXT NOT NULL, criado_por TEXT, actualizado_em TEXT, actualizado_por TEXT, actualizado_por_nome TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS compliance_kyc_verificacao (
        id TEXT PRIMARY KEY, client_id TEXT NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('inicial', 'actualizacao', 'periodica', 'reforcada')),
        documento_tipo TEXT NOT NULL, documento_ref TEXT, documento_emissor TEXT, documento_validade TEXT,
        fonte TEXT NOT NULL CHECK(fonte IN ('presencial', 'documento_original', 'copia_certificada', 'consulta_online', 'declaracao')),
        controlos TEXT, notas TEXT,
        estado TEXT NOT NULL DEFAULT 'pendente' CHECK(estado IN ('pendente', 'verificado', 'recusado')),
        registado_por TEXT, registado_por_nome TEXT, registado_em TEXT NOT NULL,
        decidido_por TEXT, decidido_por_nome TEXT, decidido_em TEXT, motivo_decisao TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_compliance_kyc_cliente ON compliance_kyc_verificacao(client_id, registado_em)`,
    `CREATE TABLE IF NOT EXISTS compliance_risco_modelo (
        id TEXT PRIMARY KEY, versao INTEGER NOT NULL, nome TEXT NOT NULL, configuracao TEXT NOT NULL,
        activo INTEGER NOT NULL DEFAULT 0 CHECK(activo IN (0, 1)), notas TEXT,
        criado_em TEXT NOT NULL, criado_por TEXT, criado_por_nome TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS compliance_risco_avaliacao (
        id TEXT PRIMARY KEY, client_id TEXT NOT NULL, modelo_id TEXT NOT NULL, modelo_versao INTEGER NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('inicial', 'reavaliacao', 'periodica', 'evento')), motivo TEXT,
        pontuacao INTEGER NOT NULL CHECK(pontuacao BETWEEN 0 AND 100), pontuacao_ponderada INTEGER NOT NULL,
        nivel TEXT NOT NULL CHECK(nivel IN ('baixo', 'medio', 'elevado')),
        decisao TEXT NOT NULL CHECK(decisao IN ('diligencia_normal', 'verificacao_complementar', 'diligencia_reforcada')),
        requer_revisao INTEGER NOT NULL DEFAULT 0 CHECK(requer_revisao IN (0, 1)),
        factores TEXT NOT NULL, regras TEXT NOT NULL, dados TEXT,
        criado_em TEXT NOT NULL, criado_por TEXT, criado_por_nome TEXT,
        revisto_por TEXT, revisto_por_nome TEXT, revisto_em TEXT,
        revisao_decisao TEXT CHECK(revisao_decisao IN ('confirmada', 'alterada') OR revisao_decisao IS NULL),
        nivel_final TEXT CHECK(nivel_final IN ('baixo', 'medio', 'elevado') OR nivel_final IS NULL), revisao_parecer TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_compliance_risco_cliente ON compliance_risco_avaliacao(client_id, criado_em)`,
    `CREATE TABLE IF NOT EXISTS compliance_duplicado_revisao (
        id TEXT PRIMARY KEY, chave TEXT NOT NULL, motivo TEXT NOT NULL, clientes TEXT NOT NULL,
        decisao TEXT NOT NULL CHECK(decisao IN ('homonimo', 'familia_partilha', 'mesma_pessoa', 'erro_cadastro', 'suspeita_fraude')),
        justificacao TEXT NOT NULL, decidido_por TEXT, decidido_por_nome TEXT, decidido_em TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_compliance_duplicado_chave ON compliance_duplicado_revisao(chave)`,
    // ── Imutabilidade ────────────────────────────────────────────────────────────────
    `CREATE TRIGGER IF NOT EXISTS trg_compliance_kyc_delete BEFORE DELETE ON compliance_kyc_verificacao
        BEGIN SELECT RAISE(ABORT, 'As verificações KYC não se apagam'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_compliance_kyc_decidida BEFORE UPDATE ON compliance_kyc_verificacao
        WHEN OLD.estado <> 'pendente' OR NEW.client_id <> OLD.client_id OR NEW.tipo <> OLD.tipo OR NEW.fonte <> OLD.fonte
            OR NEW.documento_tipo <> OLD.documento_tipo OR COALESCE(NEW.documento_ref, '') <> COALESCE(OLD.documento_ref, '')
            OR COALESCE(NEW.documento_validade, '') <> COALESCE(OLD.documento_validade, '') OR COALESCE(NEW.controlos, '') <> COALESCE(OLD.controlos, '')
            OR COALESCE(NEW.registado_por, '') <> COALESCE(OLD.registado_por, '') OR NEW.registado_em <> OLD.registado_em
        BEGIN SELECT RAISE(ABORT, 'Uma verificação KYC decide-se uma só vez e o registo não se altera'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_compliance_kyc_quatro_olhos BEFORE UPDATE ON compliance_kyc_verificacao
        WHEN NEW.decidido_por IS NOT NULL AND NEW.decidido_por = OLD.registado_por
            AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.decidido_por AND role = 'super_admin')
        BEGIN SELECT RAISE(ABORT, 'Quem registou a verificação KYC não a pode decidir'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_compliance_modelo_delete BEFORE DELETE ON compliance_risco_modelo
        BEGIN SELECT RAISE(ABORT, 'As versões do modelo de risco não se apagam'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_compliance_modelo_imutavel BEFORE UPDATE ON compliance_risco_modelo
        WHEN NEW.configuracao <> OLD.configuracao OR NEW.versao <> OLD.versao OR NEW.nome <> OLD.nome OR NEW.criado_em <> OLD.criado_em
        BEGIN SELECT RAISE(ABORT, 'Uma versão do modelo de risco não se altera: cria-se uma versão nova'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_compliance_avaliacao_delete BEFORE DELETE ON compliance_risco_avaliacao
        BEGIN SELECT RAISE(ABORT, 'As avaliações de risco não se apagam: reavalia-se'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_compliance_avaliacao_imutavel BEFORE UPDATE ON compliance_risco_avaliacao
        WHEN OLD.revisto_por IS NOT NULL OR NEW.pontuacao <> OLD.pontuacao OR NEW.pontuacao_ponderada <> OLD.pontuacao_ponderada OR NEW.nivel <> OLD.nivel
            OR NEW.decisao <> OLD.decisao OR NEW.factores <> OLD.factores OR NEW.regras <> OLD.regras OR NEW.client_id <> OLD.client_id
            OR NEW.modelo_id <> OLD.modelo_id OR NEW.criado_em <> OLD.criado_em OR COALESCE(NEW.criado_por, '') <> COALESCE(OLD.criado_por, '')
        BEGIN SELECT RAISE(ABORT, 'Uma avaliação de risco não se altera e revê-se uma só vez'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_compliance_avaliacao_quatro_olhos BEFORE UPDATE ON compliance_risco_avaliacao
        WHEN NEW.revisto_por IS NOT NULL AND NEW.revisto_por = OLD.criado_por
            AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.revisto_por AND role = 'super_admin')
        BEGIN SELECT RAISE(ABORT, 'Quem pediu a avaliação de risco não a pode rever'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_compliance_duplicado_update BEFORE UPDATE ON compliance_duplicado_revisao
        BEGIN SELECT RAISE(ABORT, 'As revisões de duplicados não se alteram'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_compliance_duplicado_delete BEFORE DELETE ON compliance_duplicado_revisao
        BEGIN SELECT RAISE(ABORT, 'As revisões de duplicados não se apagam'); END`,
];

// Fase 2: screening de PEP e sanções.
// - compliance_lista_versao (sincronizada): que versão de cada lista oficial está activa, data, impressão digital.
// - compliance_lista_bloco (SÓ neste dispositivo, nunca sincronizada): as entradas da lista em blocos de 1000 (JSON).
//   A lista OFAC tem milhares de entradas; cada computador importa o ficheiro e, se for o mesmo (mesma impressão
//   digital), reaproveita a versão activa em vez de criar outra.
// - compliance_lista_interna (sincronizada): PEP nacionais e designações registadas pela empresa.
// - compliance_screening e compliance_screening_decisao (sincronizadas, imutáveis): resultados e decisões humanas.
export const COMPLIANCE_FASE2_SQL = [
    `CREATE TABLE IF NOT EXISTS compliance_lista_versao (
        id TEXT PRIMARY KEY, fonte TEXT NOT NULL CHECK(fonte IN ('ONU', 'OFAC')), data_lista TEXT, hash TEXT NOT NULL,
        total_entradas INTEGER NOT NULL, ignoradas INTEGER NOT NULL DEFAULT 0, nome_ficheiro TEXT,
        activa INTEGER NOT NULL DEFAULT 1 CHECK(activa IN (0, 1)), importada_em TEXT NOT NULL, importada_por TEXT, importada_por_nome TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS compliance_lista_bloco (
        id TEXT PRIMARY KEY, versao_id TEXT NOT NULL, fonte TEXT NOT NULL, ordem INTEGER NOT NULL, total INTEGER NOT NULL, conteudo TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_compliance_lista_bloco_versao ON compliance_lista_bloco(versao_id, ordem)`,
    `CREATE TABLE IF NOT EXISTS compliance_lista_interna (
        id TEXT PRIMARY KEY, categoria TEXT NOT NULL CHECK(categoria IN ('pep', 'sancao', 'outro')), tipo TEXT NOT NULL CHECK(tipo IN ('pessoa', 'entidade')),
        nome TEXT NOT NULL, aliases TEXT, nascimento TEXT, nacionalidade TEXT, funcao TEXT, fonte_referencia TEXT, notas TEXT,
        activa INTEGER NOT NULL DEFAULT 1 CHECK(activa IN (0, 1)),
        criado_em TEXT NOT NULL, criado_por TEXT, criado_por_nome TEXT, actualizado_em TEXT, actualizado_por TEXT, actualizado_por_nome TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS compliance_screening (
        id TEXT PRIMARY KEY, client_id TEXT NOT NULL,
        motivo TEXT NOT NULL CHECK(motivo IN ('manual', 'novo_cliente', 'pedido_credito', 'periodico', 'lista_actualizada')),
        resultado TEXT NOT NULL CHECK(resultado IN ('NO_MATCH', 'POTENTIAL_MATCH', 'NOT_CHECKED', 'ERROR')),
        resultados TEXT NOT NULL, criterios TEXT NOT NULL, criado_em TEXT NOT NULL, criado_por TEXT, criado_por_nome TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_compliance_screening_cliente ON compliance_screening(client_id, criado_em)`,
    `CREATE TABLE IF NOT EXISTS compliance_screening_decisao (
        id TEXT PRIMARY KEY, screening_id TEXT NOT NULL, client_id TEXT NOT NULL, fonte TEXT NOT NULL, ref TEXT NOT NULL,
        nome_lista TEXT NOT NULL, nome_pesquisado TEXT NOT NULL, categoria TEXT,
        decisao TEXT NOT NULL CHECK(decisao IN ('falso_positivo', 'confirmada')), fundamento TEXT NOT NULL,
        decidido_em TEXT NOT NULL, decidido_por TEXT, decidido_por_nome TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_compliance_screening_decisao_cliente ON compliance_screening_decisao(client_id)`,
    `CREATE TRIGGER IF NOT EXISTS trg_compliance_lista_versao_delete BEFORE DELETE ON compliance_lista_versao
        BEGIN SELECT RAISE(ABORT, 'As versões das listas não se apagam'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_compliance_lista_versao_imutavel BEFORE UPDATE ON compliance_lista_versao
        WHEN NEW.hash <> OLD.hash OR NEW.fonte <> OLD.fonte OR NEW.total_entradas <> OLD.total_entradas OR NEW.importada_em <> OLD.importada_em
            OR COALESCE(NEW.data_lista, '') <> COALESCE(OLD.data_lista, '')
        BEGIN SELECT RAISE(ABORT, 'Uma versão de lista não se altera: importa-se outra'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_compliance_lista_interna_delete BEFORE DELETE ON compliance_lista_interna
        BEGIN SELECT RAISE(ABORT, 'As entradas da lista interna não se apagam: desactivam-se'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_compliance_screening_update BEFORE UPDATE ON compliance_screening
        BEGIN SELECT RAISE(ABORT, 'Os resultados do screening não se alteram'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_compliance_screening_delete BEFORE DELETE ON compliance_screening
        BEGIN SELECT RAISE(ABORT, 'Os resultados do screening não se apagam'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_compliance_screening_decisao_update BEFORE UPDATE ON compliance_screening_decisao
        BEGIN SELECT RAISE(ABORT, 'As decisões do screening não se alteram'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_compliance_screening_decisao_delete BEFORE DELETE ON compliance_screening_decisao
        BEGIN SELECT RAISE(ABORT, 'As decisões do screening não se apagam'); END`,
];

/** Versão inicial do modelo de risco (pesos da especificação, a validar pela avaliação de risco da empresa). */
export const COMPLIANCE_SEED_MODELO_SQL = `INSERT OR IGNORE INTO compliance_risco_modelo (id, versao, nome, configuracao, activo, notas, criado_em, criado_por, criado_por_nome)
    VALUES (?, 1, ?, ?, 1, ?, ?, 'sistema', 'Sistema')`;
