// Comandos de escrita do Compliance e quem os pode executar. O serviço usa estas constantes e o processo principal
// (Electron) usa `regraEscritaCompliance` para exigir a permissão de cada comando e confirmar que o utilizador
// registado como autor/decisor é o utilizador autenticado (sem isto, quem regista poderia «assinar» como outro e
// contornar a regra dos quatro olhos). Comandos de Compliance que não estejam aqui são recusados.

export const PERMISSOES_COMPLIANCE = ['compliance_view', 'compliance_manage', 'compliance_approve', 'compliance_settings', 'compliance_reports'] as const;
export type PermissaoCompliance = typeof PERMISSOES_COMPLIANCE[number];

// ── Perfil KYC ──────────────────────────────────────────────────────────────────
/** Cria o perfil (se ainda não existir) sem mexer num perfil existente. Autor: parâmetro 3. */
export const SQL_PERFIL_CRIAR = `INSERT OR IGNORE INTO compliance_perfil (id, client_id, criado_em, criado_por) VALUES (?, ?, ?, ?)`;
/** Dados declarados pelo cliente. Autor: parâmetro 10 (actualizado_por). */
export const SQL_PERFIL_DADOS = `UPDATE compliance_perfil SET profissao = ?, entidade_empregadora = ?, origem_fundos = ?, finalidade_credito = ?, pep = ?, pep_funcao = ?, pep_relacao = ?, beneficiario_efectivo = ?, documentos_entregues = ?, observacoes = ?, actualizado_por = ?, actualizado_por_nome = ?, actualizado_em = ? WHERE id = ?`;
/** Passa o processo a «em verificação» quando se regista uma verificação. Autor: parâmetro 0. */
export const SQL_PERFIL_EM_VERIFICACAO = `UPDATE compliance_perfil SET estado_kyc = 'em_verificacao', actualizado_por = ?, actualizado_por_nome = ?, actualizado_em = ? WHERE id = ? AND estado_kyc <> 'em_verificacao'`;
/** Resultado da decisão da verificação no perfil. Decisor: parâmetro 2. */
export const SQL_PERFIL_KYC_DECIDIDO = `UPDATE compliance_perfil SET estado_kyc = ?, kyc_verificado_em = ?, kyc_verificado_por = ?, kyc_verificado_por_nome = ?, actualizado_em = ? WHERE id = ?`;
/** Resultado da avaliação de risco no perfil. Autor: parâmetro 6. */
export const SQL_PERFIL_RISCO = `UPDATE compliance_perfil SET nivel_risco = ?, pontuacao_risco = ?, diligencia = ?, avaliacao_id = ?, proxima_revisao = ?, actualizado_em = ?, actualizado_por = ?, actualizado_por_nome = ? WHERE id = ?`;

// ── Verificações KYC ────────────────────────────────────────────────────────────
/** Autor: parâmetro 10 (registado_por). */
export const SQL_KYC_REGISTAR = `INSERT INTO compliance_kyc_verificacao (id, client_id, tipo, documento_tipo, documento_ref, documento_emissor, documento_validade, fonte, controlos, notas, registado_por, registado_por_nome, registado_em, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')`;
/** Decisor: parâmetro 1 (decidido_por). */
export const SQL_KYC_DECIDIR = `UPDATE compliance_kyc_verificacao SET estado = ?, decidido_por = ?, decidido_por_nome = ?, decidido_em = ?, motivo_decisao = ? WHERE id = ? AND estado = 'pendente'`;

// ── Risco ───────────────────────────────────────────────────────────────────────
/** Autor: parâmetro 15 (criado_por). */
export const SQL_AVALIACAO_REGISTAR = `INSERT INTO compliance_risco_avaliacao (id, client_id, modelo_id, modelo_versao, tipo, motivo, pontuacao, pontuacao_ponderada, nivel, decisao, requer_revisao, factores, regras, dados, criado_em, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
/** Revisor: parâmetro 0 (revisto_por). */
export const SQL_AVALIACAO_REVER = `UPDATE compliance_risco_avaliacao SET revisto_por = ?, revisto_por_nome = ?, revisto_em = ?, revisao_decisao = ?, nivel_final = ?, revisao_parecer = ? WHERE id = ? AND revisto_por IS NULL`;
/** Nível final da revisão no perfil (o nível do perfil segue a decisão humana). Revisor: parâmetro 4. */
export const SQL_PERFIL_NIVEL_REVISTO = `UPDATE compliance_perfil SET nivel_risco = ?, diligencia = ?, proxima_revisao = ?, actualizado_em = ?, actualizado_por = ?, actualizado_por_nome = ? WHERE id = ? AND avaliacao_id = ?`;
/** Nova versão do modelo de risco. Autor: parâmetro 6. */
export const SQL_MODELO_CRIAR = `INSERT INTO compliance_risco_modelo (id, versao, nome, configuracao, activo, notas, criado_em, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`;
export const SQL_MODELO_DESACTIVAR = `UPDATE compliance_risco_modelo SET activo = 0 WHERE id <> ? AND activo = 1`;

// ── Duplicados ──────────────────────────────────────────────────────────────────
/** Decisor: parâmetro 6 (decidido_por). */
export const SQL_DUPLICADO_REVER = `INSERT INTO compliance_duplicado_revisao (id, chave, motivo, clientes, decisao, justificacao, decidido_por, decidido_por_nome, decidido_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

// ── Screening (fase 2) ──────────────────────────────────────────────────────────
/** Versão nova de uma lista oficial. Autor: parâmetro 8. */
export const SQL_LISTA_VERSAO_CRIAR = `INSERT INTO compliance_lista_versao (id, fonte, data_lista, hash, total_entradas, ignoradas, nome_ficheiro, importada_em, importada_por, importada_por_nome, activa) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`;
export const SQL_LISTA_VERSAO_DESACTIVAR = `UPDATE compliance_lista_versao SET activa = 0 WHERE fonte = ? AND id <> ? AND activa = 1`;
/** Blocos de entradas (só neste dispositivo). */
export const SQL_LISTA_BLOCO_GRAVAR = `INSERT OR REPLACE INTO compliance_lista_bloco (id, versao_id, fonte, ordem, total, conteudo) VALUES (?, ?, ?, ?, ?, ?)`;
export const SQL_LISTA_BLOCO_LIMPAR = `DELETE FROM compliance_lista_bloco WHERE fonte = ? AND versao_id <> ?`;
/** Lista interna. Autor: parâmetro 11 (criar) e 10 (alterar). */
export const SQL_INTERNA_CRIAR = `INSERT INTO compliance_lista_interna (id, categoria, tipo, nome, aliases, nascimento, nacionalidade, funcao, fonte_referencia, notas, activa, criado_em, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`;
export const SQL_INTERNA_ALTERAR = `UPDATE compliance_lista_interna SET categoria = ?, tipo = ?, nome = ?, aliases = ?, nascimento = ?, nacionalidade = ?, funcao = ?, fonte_referencia = ?, notas = ?, activa = ?, actualizado_por = ?, actualizado_por_nome = ?, actualizado_em = ? WHERE id = ?`;
/** Resultado de um screening. Autor: parâmetro 7. */
export const SQL_SCREENING_REGISTAR = `INSERT INTO compliance_screening (id, client_id, motivo, resultado, resultados, criterios, criado_em, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
/** Decisão humana sobre uma possível correspondência. Decisor: parâmetro 11. */
export const SQL_SCREENING_DECIDIR = `INSERT INTO compliance_screening_decisao (id, screening_id, client_id, fonte, ref, nome_lista, nome_pesquisado, categoria, decisao, fundamento, decidido_em, decidido_por, decidido_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

// ── Alertas da monitorização (fase 3) ───────────────────────────────────────────
/** Alerta detectado (ignorado se já existir). Autor: parâmetro 13 (detectado_por). */
export const SQL_ALERTA_REGISTAR = `INSERT OR IGNORE INTO compliance_alerta (id, regra, categoria, gravidade, client_id, operacao_tabela, operacao_id, titulo, descricao, evidencias, modelo_versao, data_operacao, detectado_em, detectado_por, detectado_por_nome, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW')`;
/** Iniciar ou retomar a análise (fica responsável quem a inicia). Autor: parâmetro 0. */
export const SQL_ALERTA_ANALISAR = `UPDATE compliance_alerta SET estado = 'IN_REVIEW', responsavel_id = ?, responsavel_nome = ?, actualizado_por = ?, actualizado_em = ? WHERE id = ? AND estado IN ('NEW', 'INFORMATION_REQUESTED')`;
/** Pedir informação adicional. Autor: parâmetro 0. */
export const SQL_ALERTA_PEDIR_INFO = `UPDATE compliance_alerta SET estado = 'INFORMATION_REQUESTED', actualizado_por = ?, actualizado_em = ? WHERE id = ? AND estado = 'IN_REVIEW'`;
/** Concluir (fundamentado ou não confirmado; o resultado fica guardado mesmo depois de encerrado). Decisor: parâmetro 3. */
export const SQL_ALERTA_CONCLUIR = `UPDATE compliance_alerta SET estado = ?, resultado = ?, conclusao = ?, concluido_por = ?, concluido_por_nome = ?, concluido_em = ?, actualizado_por = ?, actualizado_em = ? WHERE id = ? AND estado IN ('IN_REVIEW', 'INFORMATION_REQUESTED')`;
/** Encerrar com as medidas tomadas. Decisor: parâmetro 1. */
export const SQL_ALERTA_ENCERRAR = `UPDATE compliance_alerta SET estado = 'CLOSED', medidas = ?, encerrado_por = ?, encerrado_por_nome = ?, encerrado_em = ?, actualizado_por = ?, actualizado_em = ? WHERE id = ? AND estado IN ('SUBSTANTIATED', 'NOT_SUBSTANTIATED')`;
/** Histórico de cada mudança (e comentários). Autor: parâmetro 5. */
export const SQL_ALERTA_HISTORICO = `INSERT INTO compliance_alerta_historico (id, alerta_id, estado_anterior, estado_novo, comentario, por, por_nome, em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

// ── Investigações (fase 4) ──────────────────────────────────────────────────────
/** Abrir uma investigação. Autor: parâmetro 11 (aberto_por). */
export const SQL_CASO_ABRIR = `INSERT INTO compliance_caso (id, numero, client_id, tipo, prioridade, titulo, descricao, prazo, responsavel_id, responsavel_nome, aberto_em, aberto_por, aberto_por_nome, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aberto')`;
/** Iniciar ou retomar a investigação. Autor: parâmetro 0. */
export const SQL_CASO_INVESTIGAR = `UPDATE compliance_caso SET estado = 'em_investigacao', actualizado_por = ?, actualizado_em = ? WHERE id = ? AND estado IN ('aberto', 'aguarda_decisao')`;
/** Passar à decisão. Autor: parâmetro 0. */
export const SQL_CASO_PARA_DECISAO = `UPDATE compliance_caso SET estado = 'aguarda_decisao', actualizado_por = ?, actualizado_em = ? WHERE id = ? AND estado = 'em_investigacao'`;
/** Responsável, prioridade e prazo. Autor: parâmetro 4. */
export const SQL_CASO_ATRIBUIR = `UPDATE compliance_caso SET responsavel_id = ?, responsavel_nome = ?, prioridade = ?, prazo = ?, actualizado_por = ?, actualizado_em = ? WHERE id = ? AND estado <> 'encerrado'`;
/** Encerrar (só com as decisões exigidas, verificadas também na base de dados). Decisor: parâmetro 1. */
export const SQL_CASO_ENCERRAR = `UPDATE compliance_caso SET estado = 'encerrado', resumo_final = ?, encerrado_por = ?, encerrado_por_nome = ?, encerrado_em = ?, actualizado_por = ?, actualizado_em = ? WHERE id = ? AND estado = 'aguarda_decisao'`;
/** Ligar um alerta, screening, avaliação ou verificação ao caso. Autor: parâmetro 6. */
export const SQL_CASO_LIGAR = `INSERT OR IGNORE INTO compliance_caso_ligacao (id, caso_id, tipo, ref_id, descricao, criado_em, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
/** Nota ou movimento no histórico do caso. Autor: parâmetro 6. */
export const SQL_CASO_NOTA = `INSERT INTO compliance_caso_nota (id, caso_id, tipo, texto, estado_anterior, estado_novo, por, por_nome, em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
/** Evidência (metadados). Autor: parâmetro 10. */
export const SQL_EVIDENCIA_REGISTAR = `INSERT INTO compliance_evidencia (id, caso_id, tipo, titulo, descricao, ficheiro_nome, ficheiro_mime, ficheiro_tamanho, ficheiro_hash, criado_em, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
export const SQL_EVIDENCIA_FICHEIRO = `INSERT INTO compliance_evidencia_ficheiro (id, conteudo) VALUES (?, ?)`;
/** Decisão (conclusão, medida ou UIF). Decisor: parâmetro 9. */
export const SQL_DECISAO_REGISTAR = `INSERT INTO compliance_decisao (id, caso_id, client_id, tipo, decisao, fundamento, referencia, data_referencia, decidido_em, decidido_por, decidido_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

type Regra = { permissao: PermissaoCompliance; autor: number | null };
const REGRAS: Array<[string, Regra]> = [
    [SQL_PERFIL_CRIAR, { permissao: 'compliance_manage', autor: 3 }],
    [SQL_PERFIL_DADOS, { permissao: 'compliance_manage', autor: 10 }],
    [SQL_PERFIL_EM_VERIFICACAO, { permissao: 'compliance_manage', autor: 0 }],
    [SQL_PERFIL_KYC_DECIDIDO, { permissao: 'compliance_approve', autor: 2 }],
    [SQL_PERFIL_RISCO, { permissao: 'compliance_manage', autor: 6 }],
    [SQL_KYC_REGISTAR, { permissao: 'compliance_manage', autor: 10 }],
    [SQL_KYC_DECIDIR, { permissao: 'compliance_approve', autor: 1 }],
    [SQL_AVALIACAO_REGISTAR, { permissao: 'compliance_manage', autor: 15 }],
    [SQL_AVALIACAO_REVER, { permissao: 'compliance_approve', autor: 0 }],
    [SQL_PERFIL_NIVEL_REVISTO, { permissao: 'compliance_approve', autor: 4 }],
    [SQL_MODELO_CRIAR, { permissao: 'compliance_settings', autor: 6 }],
    [SQL_MODELO_DESACTIVAR, { permissao: 'compliance_settings', autor: null }],
    [SQL_DUPLICADO_REVER, { permissao: 'compliance_approve', autor: 6 }],
    [SQL_LISTA_VERSAO_CRIAR, { permissao: 'compliance_settings', autor: 8 }],
    [SQL_LISTA_VERSAO_DESACTIVAR, { permissao: 'compliance_settings', autor: null }],
    [SQL_LISTA_BLOCO_GRAVAR, { permissao: 'compliance_manage', autor: null }],
    [SQL_LISTA_BLOCO_LIMPAR, { permissao: 'compliance_manage', autor: null }],
    [SQL_INTERNA_CRIAR, { permissao: 'compliance_manage', autor: 11 }],
    [SQL_INTERNA_ALTERAR, { permissao: 'compliance_manage', autor: 10 }],
    [SQL_SCREENING_REGISTAR, { permissao: 'compliance_manage', autor: 7 }],
    [SQL_SCREENING_DECIDIR, { permissao: 'compliance_approve', autor: 11 }],
    [SQL_ALERTA_REGISTAR, { permissao: 'compliance_manage', autor: 13 }],
    [SQL_ALERTA_ANALISAR, { permissao: 'compliance_manage', autor: 0 }],
    [SQL_ALERTA_PEDIR_INFO, { permissao: 'compliance_manage', autor: 0 }],
    [SQL_ALERTA_CONCLUIR, { permissao: 'compliance_approve', autor: 3 }],
    [SQL_ALERTA_ENCERRAR, { permissao: 'compliance_approve', autor: 1 }],
    [SQL_ALERTA_HISTORICO, { permissao: 'compliance_manage', autor: 5 }],
    [SQL_CASO_ABRIR, { permissao: 'compliance_manage', autor: 11 }],
    [SQL_CASO_INVESTIGAR, { permissao: 'compliance_manage', autor: 0 }],
    [SQL_CASO_PARA_DECISAO, { permissao: 'compliance_manage', autor: 0 }],
    [SQL_CASO_ATRIBUIR, { permissao: 'compliance_manage', autor: 4 }],
    [SQL_CASO_ENCERRAR, { permissao: 'compliance_approve', autor: 1 }],
    [SQL_CASO_LIGAR, { permissao: 'compliance_manage', autor: 6 }],
    [SQL_CASO_NOTA, { permissao: 'compliance_manage', autor: 6 }],
    [SQL_EVIDENCIA_REGISTAR, { permissao: 'compliance_manage', autor: 10 }],
    [SQL_EVIDENCIA_FICHEIRO, { permissao: 'compliance_manage', autor: null }],
    [SQL_DECISAO_REGISTAR, { permissao: 'compliance_approve', autor: 9 }],
];
const normalizar = (sql: string) => sql.replace(/\s+/gu, ' ').trim().replace(/;$/u, '');
const MAPA = new Map(REGRAS.map(([sql, regra]) => [normalizar(sql), regra]));

/** Permissão exigida e posição do autor de um comando de Compliance, ou null se o comando não for reconhecido. */
export function regraEscritaCompliance(sql: string): Regra | null {
    return MAPA.get(normalizar(sql)) ?? null;
}
