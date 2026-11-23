// Pedidos do portal do funcionário aceites pelo processo principal: só estas instruções (estado fixo «planeado» ou
// «pendente» e marca de pedido), com o autor nos três últimos parâmetros (criado_em, criado_por, criado_por_nome).
const PORTAL_PEDIDO_SQL = /^\s*INSERT INTO rh_(plano_ferias|ausencia) \(id, funcionario_id, .*pedido_(funcionario|dispensa)\b.*VALUES \(.*'(planeado|pendente)', 1, \?, \?, \?\)\s*$/iu;
// Reclamação sobre a folha de correcção: estado fixo «pendente», a ficha no 2.º parâmetro e o autor nos três últimos.
const PORTAL_RECLAMACAO_SQL = /^\s*INSERT INTO rh_reclamacao \(id, funcionario_id, processamento_id, recibo_id, codigo, descricao, valor_minor, motivo, estado, criado_em, criado_por, criado_por_nome\) VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, 'pendente', \?, \?, \?\)\s*$/iu;

// Confirmação da recepção do salário: a ficha no 2.º parâmetro e o autor nos três últimos (a base valida o resto).
const PORTAL_RECEBIMENTO_SQL = /^\s*INSERT INTO rh_recebimento \(id, funcionario_id, recibo_id, processamento_id, estado, observacao, criado_em, criado_por, criado_por_nome\) VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?\)\s*$/iu;

// Outro pedido ao RH (ex.: subsídio de férias): estado fixo «pendente», ficha no 2.º parâmetro, autor nos três últimos.
const PORTAL_OUTRO_PEDIDO_SQL = /^\s*INSERT INTO rh_pedido \(id, funcionario_id, tipo, ano, assunto, descricao, estado, criado_em, criado_por, criado_por_nome\) VALUES \(\?, \?, \?, \?, \?, \?, 'pendente', \?, \?, \?\)\s*$/iu;
// Mensagem do funcionário para o RH: sentido fixo «para_rh», ficha no 2.º parâmetro, autor (de_id) no penúltimo.
const PORTAL_CORREIO_SQL = /^\s*INSERT INTO rh_correio \(id, funcionario_id, sentido, assunto, corpo, resposta_a, criado_em, de_id, de_nome\) VALUES \(\?, \?, 'para_rh', \?, \?, \?, \?, \?, \?\)\s*$/iu;

export const isPortalPedidoSql = (sql: string) => {
    const texto = sql.replace(/\s+/gu, ' ');
    return PORTAL_PEDIDO_SQL.test(texto) || PORTAL_RECLAMACAO_SQL.test(texto) || PORTAL_RECEBIMENTO_SQL.test(texto)
        || PORTAL_OUTRO_PEDIDO_SQL.test(texto) || PORTAL_CORREIO_SQL.test(texto);
};

/** Marcar uma mensagem do correio interno como lida (quem a recebe; não muda o conteúdo). */
export const isMarcarCorreioLidoSql = (sql: string) => /^\s*UPDATE rh_correio SET lida = 1 WHERE id = \?\s*$/iu.test(sql.replace(/\s+/gu, ' '));

// Férias pelo portal: o funcionário cancela o seu pedido por decidir (ficha no 3.º parâmetro) e o chefe directo dá
// parecer (aprova: o próprio no 1.º parâmetro; recusa: no 2.º). O processo principal confirma a ficha e a chefia.
const PORTAL_CANCELAR_FERIAS_SQL = /^\s*UPDATE rh_plano_ferias SET estado = 'anulado', observacoes = 'Cancelado pelo funcionário', actualizado_em = \? WHERE id = \? AND funcionario_id = \? AND estado = 'planeado' AND pedido_funcionario = 1\s*$/iu;
const CHEFE_APROVA_FERIAS_SQL = /^\s*UPDATE rh_plano_ferias SET chefe_aprovado_por = \?, chefe_aprovado_por_nome = \?, chefe_aprovado_em = \?, actualizado_em = \? WHERE id = \? AND estado = 'planeado' AND pedido_funcionario = 1 AND chefe_aprovado_em IS NULL\s*$/iu;
const CHEFE_RECUSA_FERIAS_SQL = /^\s*UPDATE rh_plano_ferias SET estado = 'anulado', recusado = 1, motivo_recusa = \?, chefe_aprovado_por = \?, chefe_aprovado_por_nome = \?, chefe_aprovado_em = \?, actualizado_em = \? WHERE id = \? AND estado = 'planeado' AND pedido_funcionario = 1\s*$/iu;

export type FeriasPortalSql = { tipo: 'cancelar'; funcionarioParam: number } | { tipo: 'chefe'; actorParam: number; planoParam: number };
export const feriasPortalSql = (sql: string): FeriasPortalSql | null => {
    const texto = sql.replace(/\s+/gu, ' ');
    if (PORTAL_CANCELAR_FERIAS_SQL.test(texto)) return { tipo: 'cancelar', funcionarioParam: 2 };
    if (CHEFE_APROVA_FERIAS_SQL.test(texto)) return { tipo: 'chefe', actorParam: 0, planoParam: 4 };
    if (CHEFE_RECUSA_FERIAS_SQL.test(texto)) return { tipo: 'chefe', actorParam: 1, planoParam: 5 };
    return null;
};
