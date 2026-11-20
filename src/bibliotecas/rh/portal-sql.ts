// Pedidos do portal do funcionário aceites pelo processo principal: só estas instruções (estado fixo «planeado» ou
// «pendente» e marca de pedido), com o autor nos três últimos parâmetros (criado_em, criado_por, criado_por_nome).
const PORTAL_PEDIDO_SQL = /^\s*INSERT INTO rh_(plano_ferias|ausencia) \(id, funcionario_id, .*pedido_(funcionario|dispensa)\b.*VALUES \(.*'(planeado|pendente)', 1, \?, \?, \?\)\s*$/iu;
// Reclamação sobre a folha de correcção: estado fixo «pendente», a ficha no 2.º parâmetro e o autor nos três últimos.
const PORTAL_RECLAMACAO_SQL = /^\s*INSERT INTO rh_reclamacao \(id, funcionario_id, processamento_id, recibo_id, codigo, descricao, valor_minor, motivo, estado, criado_em, criado_por, criado_por_nome\) VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, 'pendente', \?, \?, \?\)\s*$/iu;

// Confirmação da recepção do salário: a ficha no 2.º parâmetro e o autor nos três últimos (a base valida o resto).
const PORTAL_RECEBIMENTO_SQL = /^\s*INSERT INTO rh_recebimento \(id, funcionario_id, recibo_id, processamento_id, estado, observacao, criado_em, criado_por, criado_por_nome\) VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?\)\s*$/iu;

export const isPortalPedidoSql = (sql: string) => {
    const texto = sql.replace(/\s+/gu, ' ');
    return PORTAL_PEDIDO_SQL.test(texto) || PORTAL_RECLAMACAO_SQL.test(texto) || PORTAL_RECEBIMENTO_SQL.test(texto);
};
