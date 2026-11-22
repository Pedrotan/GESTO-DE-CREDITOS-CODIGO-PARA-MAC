// Ponte leve entre os pedidos à nuvem e a sessão do utilizador no servidor (ServicoSessaoServidor). Os serviços que
// falam com as rotas da empresa importam só isto: sem dependências, sem ciclos de importação e sem carregar a sessão
// nos testes em Node. A sessão regista aqui o fornecedor do access token quando é carregada.

/** Sessão aberta (ou retomada) no servidor: a sincronização pode continuar. */
export const SERVER_SESSION_STARTED_EVENT = 'tango-server-session-started';
/** Marca de senha nos utilizadores que o navegador recebe sem hash (o login é sempre feito no servidor). */
export const SERVER_PASSWORD_PLACEHOLDER = '!sessao-no-servidor';

type Fornecedor = () => Promise<Record<string, string>>;
let fornecedor: Fornecedor | null = null;

export const registarCabecalhoSessao = (fn: Fornecedor | null) => { fornecedor = fn; };

/** `Authorization: Bearer <access token>` do utilizador com sessão no servidor; vazio sem sessão. Nunca lança. */
export const cabecalhoSessaoUtilizador = async (): Promise<Record<string, string>> => {
    if (!fornecedor) return {};
    try { return await fornecedor(); } catch { return {}; }
};
