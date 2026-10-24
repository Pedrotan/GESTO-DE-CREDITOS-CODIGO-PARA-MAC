// Cadastro de clientes: campos obrigatórios e clientes já registados com o mesmo bilhete (ou NIF) ou o mesmo nome.

type ClientLike = { id: string; name?: string | null; nif?: string | null; deletedAt?: unknown };

/** Bilhete/NIF comparável: só letras e números, em maiúsculas (ignora espaços, pontos e traços). */
export const normalizeDocument = (value?: string | null) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Nome comparável: sem acentos, sem maiúsculas e com um só espaço entre palavras. */
export const normalizeName = (value?: string | null) => String(value || '').normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

/** Clientes (activos ou na lixeira) com o mesmo bilhete/NIF e com o mesmo nome, sem contar o próprio cliente. */
export function findDuplicateClients(input: { nif?: string | null; name?: string | null; currentId?: string | null; clients: ClientLike[]; deletedClients?: ClientLike[] }) {
    const nif = normalizeDocument(input.nif);
    const name = normalizeName(input.name);
    const all = [...input.clients.map(client => ({ client, deleted: false })), ...(input.deletedClients || []).map(client => ({ client, deleted: true }))]
        .filter(({ client }) => client.id !== input.currentId);
    return {
        // «SEM-…» era o marcador antigo de clientes sem bilhete: não conta como bilhete repetido.
        byDocument: nif.length >= 5 && !nif.startsWith('SEM') ? all.filter(({ client }) => normalizeDocument(client.nif) === nif) : [],
        byName: name.length >= 3 ? all.filter(({ client }) => normalizeName(client.name) === name) : [],
    };
}

export type RequiredClientData = {
    name?: string; nif?: string; phone?: string; age?: number; maritalStatus?: string; issueDate?: string; expiryDate?: string; monthlyIncome?: number;
};

/**
 * Campos obrigatórios em falta: nome, bilhete/NIF, telefone, coordenadas bancárias e rendimento mensal para todos;
 * para pessoas singulares com BI também idade, estado civil, data de emissão e validade do bilhete.
 */
export function missingClientFields(data: RequiredClientData, context: { particular: boolean; passport: boolean; bankCoordinates: number }) {
    const missing: Array<{ field: keyof RequiredClientData | 'bankCoordinates'; label: string }> = [];
    if (String(data.name || '').trim().length < 3) missing.push({ field: 'name', label: 'Nome completo' });
    const document = normalizeDocument(data.nif);
    if (!document || document.startsWith('SEM')) missing.push({ field: 'nif', label: context.passport ? 'Número do passaporte' : context.particular ? 'Número do bilhete de identidade' : 'NIF da empresa' });
    if (!String(data.phone || '').trim()) missing.push({ field: 'phone', label: 'Telefone' });
    if (context.particular) {
        if (!(Number(data.age) > 0)) missing.push({ field: 'age', label: 'Idade' });
        if (!String(data.maritalStatus || '').trim()) missing.push({ field: 'maritalStatus', label: 'Estado civil' });
        if (!context.passport) {
            if (!data.issueDate) missing.push({ field: 'issueDate', label: 'Data de emissão do bilhete' });
            if (!data.expiryDate) missing.push({ field: 'expiryDate', label: 'Validade do bilhete' });
        }
    }
    if (context.bankCoordinates < 1) missing.push({ field: 'bankCoordinates', label: 'Coordenadas bancárias (IBAN)' });
    if (!(Number(data.monthlyIncome) > 0)) missing.push({ field: 'monthlyIncome', label: 'Rendimento mensal' });
    return missing;
}
