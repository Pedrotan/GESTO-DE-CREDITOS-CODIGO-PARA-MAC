// Operações financeiras só com o servidor contactável. No desktop a base de dados local é o servidor da empresa
// (verificação no processo principal), por isso não há sonda. Na versão web, que é uma cópia da nuvem, o serviço
// de sincronização regista uma sonda: sem ligação, a operação é recusada antes de gravar seja o que for.

export type ConnectionProbe = () => Promise<{ ok: boolean; message?: string }>;

let probe: ConnectionProbe | null = null;

export const setFinancialConnectionProbe = (next: ConnectionProbe | null) => { probe = next; };
export const hasFinancialConnectionProbe = () => probe !== null;

/** Lança um erro claro quando o servidor não está contactável. Nada é gravado neste caso. */
export async function assertFinancialConnection(operation: string): Promise<void> {
    if (!probe) return;
    let result: { ok: boolean; message?: string };
    try { result = await probe(); } catch (error: any) { result = { ok: false, message: error?.message }; }
    if (!result.ok) {
        throw new Error(`Sem ligação ao servidor: não é possível ${operation} agora. Nada foi gravado neste dispositivo. Verifique a internet e tente de novo.${result.message ? ` (${result.message})` : ''}`);
    }
}
