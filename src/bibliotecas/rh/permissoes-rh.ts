// Regras de acesso do RH verificadas no processo principal (não basta esconder botões): que leituras do renderer
// tocam em ficheiros ou dados salariais, e que carregamentos de documentos o próprio funcionário pode fazer pelo portal.
// Funções puras, partilhadas pelo electron/main.ts e pelos testes.

export type RegraLeituraRH =
    | { tipo: 'ficheiro_documento'; documentoParam: number }
    | { tipo: 'anexo_justificacao'; justificacaoParam: number }
    | { tipo: 'salarial' }
    | { tipo: 'salarial_funcionario'; funcionarioParam: number }
    | { tipo: 'salarial_recibo'; reciboParam: number };

const normalizar = (sql: string) => sql.replace(/\s+/gu, ' ').trim();

/** Regra de acesso de uma leitura, ou null quando a leitura não é sensível. */
export function regraLeituraRH(sql: string): RegraLeituraRH | null {
    const s = normalizar(sql);
    if (/^SELECT data_url FROM rh_documento_ficheiro WHERE documento_id = \?$/iu.test(s)) return { tipo: 'ficheiro_documento', documentoParam: 0 };
    if (/^SELECT anexo_nome, anexo_data_url FROM rh_justificacao WHERE id = \?$/iu.test(s)) return { tipo: 'anexo_justificacao', justificacaoParam: 0 };
    if (/^SELECT \* FROM rh_historico_salarial WHERE funcionario_id = \?/iu.test(s)) return { tipo: 'salarial_funcionario', funcionarioParam: 0 };
    if (/FROM rh_recibo r JOIN rh_processamento p ON p\.id = r\.processamento_id WHERE r\.funcionario_id = \?/iu.test(s)) return { tipo: 'salarial_funcionario', funcionarioParam: 0 };
    if (/^SELECT \* FROM rh_recibo_linha WHERE recibo_id = \?/iu.test(s)) return { tipo: 'salarial_recibo', reciboParam: 0 };
    if (/\bFROM rh_recibo\b|\bFROM rh_recibo_linha\b|\bFROM rh_processamento_entrada\b/iu.test(s)) return { tipo: 'salarial' };
    return null;
}

/** Subpastas onde o funcionário pode carregar documentos pelo portal (e as categorias correspondentes). */
export const PORTAL_PASTAS_CARREGAMENTO: Record<string, string> = { 'sys:identificacao': 'identificacao', 'sys:formacao': 'academica' };

const INSERIR_DOCUMENTO = /^INSERT INTO rh_documento \(id, funcionario_id, categoria, nome, ficheiro_nome, mime, tamanho, data_emissao, data_validade, confidencial, estado, carregado_por, carregado_por_nome, criado_em, pasta_id, origem, versao\)/iu;
const INSERIR_FICHEIRO = /^INSERT INTO rh_documento_ficheiro \(documento_id, data_url\) VALUES/iu;
const INSERIR_ACESSO = /^INSERT INTO rh_doc_auditoria \(/iu;

/**
 * Carregamento pelo portal (sem «gerir RH»): só INSERT de um documento novo, não confidencial, numa das subpastas
 * permitidas e em nome do próprio utilizador, mais o ficheiro e o registo de acesso desse mesmo documento.
 * Devolve os ids dos documentos aceites; a ficha (funcionário = utilizador) confirma-se à parte, de forma assíncrona.
 */
export function carregamentoPortalPermitido(statements: Array<{ sql: string; params?: unknown[] }>, actorId: string) {
    const aceites = new Set<string>();
    for (const st of statements) {
        const s = normalizar(st.sql);
        if (!INSERIR_DOCUMENTO.test(s)) continue;
        const p = st.params || [];
        const [id, , categoria, , , , , , , confidencial, carregadoPor, , , pasta] = [p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11], p[12], p[13]];
        if (typeof id === 'string' && carregadoPor === actorId && Number(confidencial) === 0 && typeof pasta === 'string' && PORTAL_PASTAS_CARREGAMENTO[pasta] === categoria) aceites.add(id);
    }
    const ok = statements.every(st => {
        const s = normalizar(st.sql);
        if (INSERIR_DOCUMENTO.test(s)) return aceites.has(String(st.params?.[0]));
        if (INSERIR_FICHEIRO.test(s)) return aceites.has(String(st.params?.[0]));
        if (INSERIR_ACESSO.test(s)) return aceites.has(String(st.params?.[1])) && st.params?.[4] === actorId;
        return /^INSERT INTO audit_logs\b/iu.test(s);
    });
    return ok && aceites.size > 0 ? aceites : null;
}
