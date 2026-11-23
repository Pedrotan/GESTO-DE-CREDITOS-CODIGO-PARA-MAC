// Possíveis duplicados e dados partilhados entre clientes: o mesmo BI/NIF, o mesmo IBAN, o mesmo telefone ou email,
// ou o mesmo nome com a mesma data de nascimento. Um grupo não prova fraude: pode ser um homónimo, uma família que
// partilha o telefone ou um erro de cadastro. Por isso cada grupo é revisto por uma pessoa, que regista a decisão
// e a justificação; um grupo revisto só volta a aparecer se mudar (entrar outro cliente com o mesmo dado).

import { normalizeDocument, normalizeName } from '../cliente-validacao.ts';
import { mascararDocumento } from './kyc.ts';

export type MotivoDuplicado = 'documento' | 'iban' | 'telefone' | 'email' | 'nome_nascimento';
export type DecisaoDuplicado = 'homonimo' | 'familia_partilha' | 'mesma_pessoa' | 'erro_cadastro' | 'suspeita_fraude';

export const ROTULO_MOTIVO: Record<MotivoDuplicado, string> = {
    documento: 'Mesmo BI/NIF', iban: 'Mesmo IBAN', telefone: 'Mesmo telefone', email: 'Mesmo email', nome_nascimento: 'Mesmo nome e data de nascimento',
};
export const GRAVIDADE_MOTIVO: Record<MotivoDuplicado, 'alta' | 'media'> = {
    documento: 'alta', iban: 'alta', telefone: 'media', email: 'media', nome_nascimento: 'media',
};
export const ROTULO_DECISAO_DUPLICADO: Record<DecisaoDuplicado, string> = {
    homonimo: 'Pessoas diferentes (homónimos)',
    familia_partilha: 'Pessoas diferentes que partilham o contacto ou a conta (família, empresa)',
    mesma_pessoa: 'A mesma pessoa registada duas vezes',
    erro_cadastro: 'Erro de cadastro a corrigir',
    suspeita_fraude: 'Suspeita de fraude: encaminhar para análise',
};

export type ClienteDuplicado = {
    id: string; name?: string | null; nif?: string | null; phone?: string | null; email?: string | null; birthDate?: string | null;
    bankCoordinates?: Array<{ iban?: string | null }> | null; deletedAt?: unknown;
};
export type GrupoDuplicado = { chave: string; motivo: MotivoDuplicado; valor: string; clientes: string[]; gravidade: 'alta' | 'media' };
export type RevisaoDuplicado = { chave: string };

/** Telefone angolano comparável (9 algarismos, sem +244); outros números ficam só com os algarismos. */
export function normalizarTelefone(valor: string | null | undefined) {
    let d = String(valor || '').replace(/\D/gu, '');
    if (d.startsWith('00244')) d = d.slice(5);
    else if (d.length === 12 && d.startsWith('244')) d = d.slice(3);
    return d.length >= 9 ? d : '';
}
export const normalizarIban = (valor: string | null | undefined) => { const v = String(valor || '').toUpperCase().replace(/[^A-Z0-9]/gu, ''); return v.length >= 15 ? v : ''; };
const normalizarEmail = (valor: string | null | undefined) => { const v = String(valor || '').trim().toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(v) ? v : ''; };

const mascarar = (motivo: MotivoDuplicado, valor: string) => {
    if (motivo === 'documento') return mascararDocumento(valor);
    if (motivo === 'iban') return `${valor.slice(0, 4)}•••••${valor.slice(-4)}`;
    if (motivo === 'telefone') return `${valor.slice(0, 3)}•••${valor.slice(-3)}`;
    if (motivo === 'email') { const [u, d] = valor.split('@'); return `${u.slice(0, 2)}•••@${d}`; }
    return valor.split('|')[0];
};

/** Chave estável de um grupo: motivo + ids ordenados (muda se o grupo ganhar ou perder clientes). */
export const chaveGrupo = (motivo: MotivoDuplicado, ids: string[]) => `${motivo}:${[...ids].sort().join('|')}`;

/** Grupos de clientes (dois ou mais) com o mesmo dado. Com `revisoes`, ficam de fora os já revistos. */
export function detectarDuplicados(clientes: ClienteDuplicado[], revisoes: RevisaoDuplicado[] = []): GrupoDuplicado[] {
    const revistos = new Set(revisoes.map(r => r.chave));
    const mapas: Record<MotivoDuplicado, Map<string, Set<string>>> = {
        documento: new Map(), iban: new Map(), telefone: new Map(), email: new Map(), nome_nascimento: new Map(),
    };
    const juntar = (motivo: MotivoDuplicado, valor: string, id: string) => {
        if (!valor) return;
        const ids = mapas[motivo].get(valor) || new Set<string>();
        ids.add(id);
        mapas[motivo].set(valor, ids);
    };
    for (const c of clientes) {
        if (c.deletedAt) continue;
        const doc = normalizeDocument(c.nif);
        if (doc.length >= 5 && !doc.startsWith('SEM')) juntar('documento', doc, c.id);
        for (const conta of c.bankCoordinates || []) juntar('iban', normalizarIban(conta?.iban), c.id);
        juntar('telefone', normalizarTelefone(c.phone), c.id);
        juntar('email', normalizarEmail(c.email), c.id);
        const nome = normalizeName(c.name);
        const nascimento = String(c.birthDate || '').slice(0, 10);
        if (nome.length >= 3 && /^\d{4}-\d{2}-\d{2}$/u.test(nascimento)) juntar('nome_nascimento', `${nome}|${nascimento}`, c.id);
    }
    const grupos: GrupoDuplicado[] = [];
    for (const motivo of Object.keys(mapas) as MotivoDuplicado[]) {
        for (const [valor, ids] of mapas[motivo]) {
            if (ids.size < 2) continue;
            const lista = [...ids].sort();
            const chave = chaveGrupo(motivo, lista);
            if (revistos.has(chave)) continue;
            grupos.push({ chave, motivo, valor: mascarar(motivo, valor), clientes: lista, gravidade: GRAVIDADE_MOTIVO[motivo] });
        }
    }
    return grupos.sort((a, b) => (a.gravidade === b.gravidade ? b.clientes.length - a.clientes.length : a.gravidade === 'alta' ? -1 : 1));
}

/** Motivos dos grupos por rever em que o cliente aparece (para o motor de risco e a ficha). */
export function motivosDoCliente(clienteId: string, grupos: GrupoDuplicado[]) {
    return [...new Set(grupos.filter(g => g.clientes.includes(clienteId)).map(g => ROTULO_MOTIVO[g.motivo]))];
}
