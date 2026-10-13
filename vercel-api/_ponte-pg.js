// Ponte pg.Pool → driver neon() (servidor da VPS): converte o resultado do pg no formato da resposta HTTP da Neon.
//
// O pg já devolve valores convertidos (datas como Date, JSON/JSONB como objectos). O driver neon volta a
// convertê-los pelo tipo de cada coluna: as datas passam como texto (tipo 25) e os JSON/JSONB seguem como texto
// JSON, que o neon converte de novo em objecto. Sem isto, uma coluna JSONB rebentava com
// "[object Object] is not valid JSON".

const DATE_TYPES = new Set([1082, 1083, 1114, 1184, 1266]);
const JSON_TYPES = new Set([114, 3802]);

export const toNeonResult = (result) => {
  const fields = (result.fields || []).map(field => ({
    name: field.name,
    dataTypeID: DATE_TYPES.has(field.dataTypeID) ? 25 : field.dataTypeID,
  }));
  const jsonColumns = (result.fields || []).map((field, index) => (JSON_TYPES.has(field.dataTypeID) ? index : -1)).filter(index => index >= 0);
  const rows = (result.rows || []).map(row => {
    if (!jsonColumns.length || !Array.isArray(row)) return row;
    const copy = [...row];
    for (const index of jsonColumns) {
      if (copy[index] !== null && copy[index] !== undefined && typeof copy[index] !== 'string') copy[index] = JSON.stringify(copy[index]);
    }
    return copy;
  });
  return { fields, rows };
};
