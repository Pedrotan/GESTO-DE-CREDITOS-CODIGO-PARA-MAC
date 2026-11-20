// Bloqueio por empresa das gravações em tango_sync_operations. O número (seq) de cada alteração é atribuído quando a
// gravação começa e só fica visível quando termina: com duas gravações da mesma empresa ao mesmo tempo, quem recebesse
// entre as duas podia avançar o cursor para lá dos números da primeira e nunca mais os receber. Toda a gravação nesta
// tabela (inserir, limpar, eliminar a empresa) começa por este bloqueio, no mesmo comando e até ao fim da transacção.
// Há um teste que recusa qualquer gravação nesta tabela que não o use.

export const TENANT_LOCK_KEY = 7041;

/** CTE que espera pelas outras gravações da empresa (`param` = o parâmetro com o hash da empresa). */
export const tenantLockCte = (param = '$1') =>
  `WITH tenant_lock AS (SELECT pg_advisory_xact_lock(hashtextextended(${param}, ${TENANT_LOCK_KEY})) AS locked)`;
