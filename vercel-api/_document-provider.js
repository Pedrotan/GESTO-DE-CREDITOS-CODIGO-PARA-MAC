export async function lookupConfiguredProvider(document, type, env = process.env, request = fetch) {
  const company = type === 'COLECTIVO';
  const key = String(company ? env.TANGO_NIF_PROVIDER_KEY || '' : env.TANGO_BI_PROVIDER_KEY || '').trim();
  if (!key) return { success: false, code: 'PROVIDER_NOT_CONFIGURED',
    message: 'Consulta automática não configurada: o administrador deve configurar a chave do fornecedor de ' + (company ? 'NIF.' : 'BI.') };
  const url = company
    ? 'https://api-agt.angohost.ao/consultar/' + encodeURIComponent(document)
    : 'https://joaotomas.elprimesolution.com/api/gateway/consulta-bi/consultar/' + encodeURIComponent(document);
  try {
    const response = await request(url, {
      headers: { Accept: 'application/json', ...(company ? { Authorization: 'Bearer ' + key } : { 'X-API-Key': key }) },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403 ? 'PROVIDER_AUTH_FAILED'
        : response.status === 404 ? 'DOCUMENT_NOT_FOUND' : 'PROVIDER_UNAVAILABLE';
      return { success: false, code, message: code === 'PROVIDER_AUTH_FAILED'
        ? 'A chave do fornecedor de consulta foi recusada. Contacte o administrador.'
        : code === 'DOCUMENT_NOT_FOUND' ? 'Documento não encontrado pelo fornecedor.'
        : 'O fornecedor de consulta está indisponível. Tente novamente ou consulte o portal oficial.' };
    }
    const raw = await response.json();
    const data = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
    const name = data?.name || data?.nome || data?.razao_social;
    if (raw?.error || raw?.success === false || data?.success === false || !name || typeof name !== 'string') {
      return { success: false, code: 'DOCUMENT_NOT_FOUND', message: 'O fornecedor não devolveu dados para este documento.' };
    }
    return { success: true, name: name.trim(), address: data.endereco || data.address,
      birthDate: data.data_de_nascimento || data.data_nascimento || data.birthDate,
      gender: data.sexo || data.gender, status: data.estado || data.status,
      source: company ? 'AngoHost — Consulta NIF' : 'João Tomás — Consulta BI' };
  } catch {
    return { success: false, code: 'PROVIDER_UNAVAILABLE', message: 'O fornecedor de consulta não respondeu dentro do prazo.' };
  }
}