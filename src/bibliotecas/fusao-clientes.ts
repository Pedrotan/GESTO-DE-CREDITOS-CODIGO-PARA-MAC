// Clientes repetidos entre dispositivos. A base local aceita o mesmo NIF (ou telefone) em dois clientes: uma pessoa
// registada em dois computadores antes de sincronizarem, ou um bilhete trocado ao digitar. Nenhum cliente que chega de
// outro dispositivo fica de fora (antes ficava retido e os contratos dele apareciam sem cliente na lista).
//
// Depois de cada sincronização, cada dispositivo faz o mesmo (só localmente, pelos mesmos dados, por isso todos chegam
// ao mesmo resultado):
//  - mesmo NIF e mesmo nome → é a mesma pessoa: fica o registo mais antigo (em empate, o de menor ID); o outro fica
//    «fundido» (na lixeira, com a indicação) e os créditos, contratos e restantes registos passam para o que fica,
//    incluindo os que chegarem depois;
//  - mesmo NIF e nomes diferentes → são pessoas diferentes: ficam as duas (o NIF repetido corrige-se na ficha);
//  - a fusão só por NIF da versão de 27/10/2026 juntou pessoas diferentes: o cliente volta e os créditos e contratos
//    com o nome dele voltam a ser dele.
import { normalizeDocument, normalizeName } from './cliente-validacao.ts';

export type ClienteParaFusao = {
    id: string; name?: string | null; nif?: string | null; createdAt?: string | null; deletedAt?: string | null; deletedBy?: string | null;
};

/**
 * Tabelas que apontam para o cliente e o comando (fixo) que muda o cliente de uma linha. As aprovações de crédito não
 * entram: são o registo de uma decisão (guardam o nome do cliente) e no computador só o aprovador as pode gravar — o
 * processo principal recusava a transacção inteira como «acção sem permissão» e os repetidos ficavam na lista.
 */
export const TABELAS_REFERENCIA = {
    credits: 'UPDATE credits SET clientId = ? WHERE id = ?',
    contracts: 'UPDATE contracts SET clientId = ? WHERE id = ?',
    warranties: 'UPDATE warranties SET clientId = ? WHERE id = ?',
    legal_cases: 'UPDATE legal_cases SET clientId = ? WHERE id = ?',
    collection_messages: 'UPDATE collection_messages SET clientId = ? WHERE id = ?',
    simulations: 'UPDATE simulations SET clientId = ? WHERE id = ?',
} as const;
export type TabelaReferencia = keyof typeof TABELAS_REFERENCIA;
/** Tabelas que também guardam o nome do cliente (permitem devolver as linhas de uma fusão errada ao dono). */
export const TABELAS_COM_NOME: readonly TabelaReferencia[] = ['credits', 'contracts', 'collection_messages', 'simulations'];

export type ReferenciaCliente = { table: TabelaReferencia; id: string; clientId: string; clientName?: string | null };
export type ComandoFusao = { sql: string; params: unknown[] };
export type PlanoFusao = { statements: ComandoFusao[]; restaurados: number; fundidos: number; religados: number };

export const FUSAO_SQL = 'UPDATE clients SET deletedAt = ?, deletedBy = ? WHERE id = ?';
export const RESTAURAR_SQL = 'UPDATE clients SET deletedAt = NULL, deletedBy = NULL WHERE id = ?';
/** Indicação gravada no cliente fundido (e lida de volta para religar o que chegar depois). */
export const marcaFusao = (vencedorId: string) => `Fundido com o cliente ${vencedorId} (mesmo NIF e nome)`;
const MARCA = /^Fundido com o cliente (.+) \(mesmo NIF( e nome)?\)$/u;

const nome = (cliente: { name?: string | null }) => normalizeName(cliente.name);
const mesmaPessoa = (a: ClienteParaFusao, b: ClienteParaFusao) => nome(a) !== '' && nome(a) === nome(b);
const chaveDuplicado = (cliente: ClienteParaFusao) => {
    const documento = normalizeDocument(cliente.nif);
    // «SEM-…» era o marcador antigo de clientes sem bilhete: não é um NIF.
    return documento.length >= 5 && !documento.startsWith('SEM') && nome(cliente) ? `${documento}|${nome(cliente)}` : '';
};

/** Qual dos dois fica: o mais antigo; em empate (ou sem data), o de menor ID. */
export const clienteQueFica = <T extends { id: string; createdAt?: unknown }>(a: T, b: T): T => {
    const tempo = (valor: unknown) => {
        const data = Date.parse(String(valor || ''));
        return Number.isFinite(data) ? data : Number.MAX_SAFE_INTEGER;
    };
    const diferenca = tempo(a.createdAt) - tempo(b.createdAt);
    if (diferenca !== 0) return diferenca < 0 ? a : b;
    return a.id <= b.id ? a : b;
};

/** Clientes cujas linhas é preciso ler: os fundidos, para onde foram, e os que têm NIF e nome repetidos. */
export const clientesEnvolvidos = (clientes: ClienteParaFusao[]) => {
    const ids = new Set<string>();
    const grupos = new Map<string, string[]>();
    for (const cliente of clientes) {
        const marca = cliente.deletedAt && cliente.deletedBy ? MARCA.exec(cliente.deletedBy) : null;
        if (marca) { ids.add(cliente.id); ids.add(marca[1]); continue; }
        const chave = cliente.deletedAt ? '' : chaveDuplicado(cliente);
        if (chave) grupos.set(chave, [...(grupos.get(chave) || []), cliente.id]);
    }
    for (const lista of grupos.values()) if (lista.length > 1) lista.forEach(id => ids.add(id));
    return ids;
};

/** Comandos (só locais) que deixam os clientes deste dispositivo como em todos os outros. */
export const planoReconciliacaoClientes = (clientes: ClienteParaFusao[], referencias: ReferenciaCliente[], agora = new Date().toISOString()): PlanoFusao => {
    const porId = new Map(clientes.map(cliente => [cliente.id, cliente]));
    const linhas = referencias.map(linha => ({ ...linha }));
    const statements: ComandoFusao[] = [];
    const destino = new Map<string, string>();
    const restaurados = new Set<string>();
    let religados = 0;
    const mudar = (linha: (typeof linhas)[number], clientId: string) => {
        statements.push({ sql: TABELAS_REFERENCIA[linha.table], params: [clientId, linha.id] });
        linha.clientId = clientId;
        religados += 1;
    };

    // 1. Fusões já feitas: válidas (mesmo nome) ficam; as de pessoas diferentes desfazem-se.
    for (const cliente of clientes) {
        const marca = cliente.deletedAt && cliente.deletedBy ? MARCA.exec(cliente.deletedBy) : null;
        if (!marca) continue;
        const vencedor = porId.get(marca[1]);
        if (vencedor && vencedor.id !== cliente.id && mesmaPessoa(cliente, vencedor)) {
            destino.set(cliente.id, vencedor.id);
            continue;
        }
        statements.push({ sql: RESTAURAR_SQL, params: [cliente.id] });
        restaurados.add(cliente.id);
        if (!vencedor || !nome(cliente)) continue;
        for (const linha of linhas) {
            if (linha.clientId === vencedor.id && TABELAS_COM_NOME.includes(linha.table) && normalizeName(linha.clientName) === nome(cliente)) mudar(linha, cliente.id);
        }
    }

    // 2. Mesma pessoa registada mais de uma vez (mesmo NIF e mesmo nome) entre os clientes activos.
    const grupos = new Map<string, ClienteParaFusao[]>();
    for (const cliente of clientes) {
        if (cliente.deletedAt && !restaurados.has(cliente.id)) continue;
        const chave = chaveDuplicado(cliente);
        if (chave) grupos.set(chave, [...(grupos.get(chave) || []), cliente]);
    }
    let fundidos = 0;
    for (const grupo of grupos.values()) {
        if (grupo.length < 2) continue;
        const vencedor = grupo.reduce((a, b) => clienteQueFica(a, b));
        for (const cliente of grupo) {
            if (cliente.id === vencedor.id) continue;
            statements.push({ sql: FUSAO_SQL, params: [agora, marcaFusao(vencedor.id), cliente.id] });
            destino.set(cliente.id, vencedor.id);
            fundidos += 1;
        }
    }

    // 3. Linhas que ainda apontam para um cliente fundido (também as que chegaram depois da fusão).
    const final = (id: string) => {
        let actual = id;
        for (let passos = 0; destino.has(actual) && passos < 20; passos += 1) actual = destino.get(actual)!;
        return actual;
    };
    for (const linha of linhas) {
        const alvo = final(linha.clientId);
        if (alvo !== linha.clientId) mudar(linha, alvo);
    }
    return { statements, restaurados: restaurados.size, fundidos, religados };
};
