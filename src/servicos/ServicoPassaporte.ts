/**
 * Validação de números de passaporte.
 *
 * Isolado de propósito (ponto 2 da especificação): a API disponível só valida o
 * *formato* de passaportes **angolanos** (1 letra + 7 dígitos). Não confirma
 * que o documento existe, nem cobre passaportes de outros países — um
 * passaporte português ou brasileiro legítimo seria sempre rejeitado.
 *
 * Por isso a chamada externa só é feita quando o país é Angola. Para os
 * restantes aplica-se apenas validação local, e em nenhum caso o cadastro é
 * bloqueado: uma indisponibilidade externa não pode impedir um registo.
 *
 * Trocar por um serviço internacional no futuro é mexer só neste ficheiro.
 */

const BASE_URL =
    (import.meta.env.VITE_PASSPORT_API_URL as string | undefined)?.replace(/\/+$/, '') ||
    'https://angolaapi.onrender.com/api/v1';

const TIMEOUT_MS = 8_000;

/** Formato genérico aceite quando não há validação externa aplicável. */
const FORMATO_GENERICO = /^[A-Z0-9]{6,12}$/;

export type EstadoPassaporte =
    | 'vazio'
    | 'formato-invalido'
    | 'a-validar'
    | 'valido'
    | 'invalido'
    | 'nao-verificado';

export interface ResultadoPassaporte {
    estado: EstadoPassaporte;
    mensagem?: string;
}

/** Normaliza para maiúsculas sem espaços nem pontuação. */
export const normalizarPassaporte = (valor: string): string =>
    valor.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 12);

/** Validação local: alfanumérico, 6 a 12 caracteres. */
export const formatoPassaporteValido = (numero: string): boolean =>
    FORMATO_GENERICO.test(normalizarPassaporte(numero));

/**
 * Valida o formato de um passaporte angolano na Angola API.
 *
 * Devolve 'valido' / 'invalido' conforme a resposta, e 'nao-verificado' se o
 * serviço não responder — nunca lança, para o formulário não ficar refém dele.
 */
export async function validarPassaporteAngola(numero: string): Promise<ResultadoPassaporte> {
    const limpo = normalizarPassaporte(numero);
    if (!limpo) return { estado: 'vazio' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const r = await fetch(`${BASE_URL}/validate/passport/${encodeURIComponent(limpo)}`, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
        });

        if (r.ok) {
            return { estado: 'valido', mensagem: 'Formato de passaporte angolano válido.' };
        }
        if (r.status === 400) {
            return { estado: 'invalido', mensagem: 'Número de passaporte angolano inválido.' };
        }
        return { estado: 'nao-verificado', mensagem: 'Não foi possível verificar o passaporte.' };
    } catch {
        // Rede em baixo, timeout ou CORS bloqueado: segue sem verificação.
        return { estado: 'nao-verificado', mensagem: 'Verificação externa indisponível.' };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Ponto de entrada usado pelo formulário.
 * Escolhe a estratégia consoante o país do titular.
 */
export async function validarPassaporte(
    numero: string,
    codigoPais?: string
): Promise<ResultadoPassaporte> {
    const limpo = normalizarPassaporte(numero);
    if (!limpo) return { estado: 'vazio' };

    if (!FORMATO_GENERICO.test(limpo)) {
        return {
            estado: 'formato-invalido',
            mensagem: 'O passaporte deve ter entre 6 e 12 caracteres alfanuméricos.',
        };
    }

    if (codigoPais?.toUpperCase() === 'AO') {
        return validarPassaporteAngola(limpo);
    }

    // Fora de Angola não há fonte que valide: aceita-se o formato genérico.
    return {
        estado: 'nao-verificado',
        mensagem: 'Formato aceite. Não há verificação externa para este país.',
    };
}
