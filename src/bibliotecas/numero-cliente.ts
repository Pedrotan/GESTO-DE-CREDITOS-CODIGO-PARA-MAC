// Número do cliente: 8 algarismos = «00» + ano (2 algarismos) + mês do cadastro + sequência do mês (01 a 99).
// Ex.: o 7.º cliente cadastrado em Novembro de 2026 recebe 00261107. Os números nunca se repetem nem se reutilizam.

import { luandaParts } from './fuso-angola.ts';

export const NUMERO_CLIENTE = /^00\d{2}(0[1-9]|1[0-2])\d{2}$/u;
export const MAX_POR_MES = 99;

const pad = (n: number) => String(n).padStart(2, '0');

/** «00AAMM» do mês de cadastro (fuso de Angola). Data inválida: o mês actual. */
export function prefixoCliente(data: Date | string | number | null | undefined, agora: Date = new Date()): string {
    const p = (data !== null && data !== undefined && data !== '' ? luandaParts(data) : null) || luandaParts(agora)!;
    return `00${pad(p.year % 100)}${pad(p.month + 1)}`;
}

/** Maior sequência já usada em cada mês (prefixo → sequência). */
function maioresPorPrefixo(existentes: Iterable<string | null | undefined>) {
    const maior = new Map<string, number>();
    for (const numero of existentes) {
        if (!numero || !NUMERO_CLIENTE.test(numero)) continue;
        const prefixo = numero.slice(0, 6);
        maior.set(prefixo, Math.max(maior.get(prefixo) || 0, Number(numero.slice(6))));
    }
    return maior;
}

/** Próximo número livre do mês (depois do maior já usado, para nunca reutilizar um número apagado). */
export function proximoNumeroCliente(prefixo: string, existentes: Iterable<string | null | undefined>): string {
    const seguinte = (maioresPorPrefixo(existentes).get(prefixo) || 0) + 1;
    if (seguinte > MAX_POR_MES) throw new Error(`Já foram atribuídos ${MAX_POR_MES} números de cliente neste mês (${prefixo.slice(4)}/20${prefixo.slice(2, 4)}): o formato de 8 algarismos não permite mais.`);
    return `${prefixo}${pad(seguinte)}`;
}

/**
 * Números para os clientes que ainda não têm: por ordem de cadastro (e id, para todos os dispositivos chegarem
 * ao mesmo resultado), a continuar depois dos números já usados em cada mês. Os que não cabem ficam de fora.
 */
export function atribuirNumerosEmFalta(clientes: Array<{ id: string; createdAt: Date | string | null | undefined; clientNumber?: string | null }>, agora: Date = new Date()) {
    const maior = maioresPorPrefixo(clientes.map(c => c.clientNumber));
    const semNumero = clientes.filter(c => !c.clientNumber || !NUMERO_CLIENTE.test(c.clientNumber))
        .map(c => ({ ...c, t: new Date(c.createdAt ?? '').getTime() }))
        .sort((a, b) => (Number.isFinite(a.t) ? a.t : Infinity) - (Number.isFinite(b.t) ? b.t : Infinity) || a.id.localeCompare(b.id));
    const atribuidos: Array<{ id: string; numero: string }> = [];
    const semEspaco: string[] = [];
    for (const c of semNumero) {
        const prefixo = prefixoCliente(c.createdAt, agora);
        const seguinte = (maior.get(prefixo) || 0) + 1;
        if (seguinte > MAX_POR_MES) { semEspaco.push(c.id); continue; }
        maior.set(prefixo, seguinte);
        atribuidos.push({ id: c.id, numero: `${prefixo}${pad(seguinte)}` });
    }
    return { atribuidos, semEspaco };
}
