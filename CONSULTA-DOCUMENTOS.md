# Consulta de NIF e BI

As chaves ficam exclusivamente nas variáveis de ambiente do servidor Vercel:
- TANGO_NIF_PROVIDER_KEY: chave Bearer emitida pela AngoHost (https://api-agt.angohost.ao/docs.html).
- TANGO_BI_PROVIDER_KEY: chave X-API-Key emitida por João Tomás (https://joaotomas.elprimesolution.com/api/consulta-bi).

Estas chaves são diferentes de TANGO_MASTER_SECRET e TANGO_LOOKUP_API_KEY, que autorizam o acesso à API Tango.
Após configurar, é necessário publicar novamente o servidor.
O Master deve ter o endereço desse servidor e a chave mestra configurados.
Sem credenciais do fornecedor, a API devolve PROVIDER_NOT_CONFIGURED em vez de simular um resultado.
Os pedidos têm timeout de 8 segundos e as respostas não expõem as chaves.

Alternativas oficiais:
- Portal do Contribuinte: https://portaldocontribuinte.minfin.gov.ao/consultar-nif-do-contribuinte
- SEPE (NIF associado ao documento, não cadastro completo de BI): https://sepe.gov.ao/catalogo/eservicos/consulta-de-nif
- Portal do Parceiro AGT para acesso à integração fiscal: https://portaldoparceiro.minfin.gov.ao/

A biblioteca @djosekispy/nifvalidation já está instalada e usa Puppeteer para consultar o Portal do Contribuinte; não constitui uma segunda base de dados nem uma API oficial.
A rota do servidor utiliza agora as APIs documentadas, sem automação de formulários oficiais.