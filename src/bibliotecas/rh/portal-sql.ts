// Pedidos do portal do funcionário aceites pelo processo principal: só estas instruções (estado fixo «planeado» ou
// «pendente» e marca de pedido), com o autor nos três últimos parâmetros (criado_em, criado_por, criado_por_nome).
const PORTAL_PEDIDO_SQL = /^\s*INSERT INTO rh_(plano_ferias|ausencia) \(id, funcionario_id, .*pedido_(funcionario|dispensa)\b.*VALUES \(.*'(planeado|pendente)', 1, \?, \?, \?\)\s*$/iu;

export const isPortalPedidoSql = (sql: string) => PORTAL_PEDIDO_SQL.test(sql.replace(/\s+/gu, ' '));
