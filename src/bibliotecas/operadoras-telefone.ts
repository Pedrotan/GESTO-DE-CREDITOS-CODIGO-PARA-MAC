// Validação de números de telefone de Angola e identificação da operadora móvel pelo prefixo
// (mesmas regras da Angola-API: +244 seguido de 9 dígitos; 92/93/94 Unitel, 91/99 Movicel, 95 Africell).
// Feita localmente: instantânea e sem depender da Internet.

export type OperadoraMovel = 'Unitel' | 'Movicel' | 'Africell';

export type ResultadoTelefone = {
    valido: boolean;
    /** Número no formato internacional (+244XXXXXXXXX), quando tem 9 dígitos. */
    numero?: string;
    operadora: OperadoraMovel | null;
    /** Rede fixa (começa por 2), sem operadora móvel. */
    fixo: boolean;
    mensagem: string;
};

const PREFIXOS_MOVEIS: Record<OperadoraMovel, string[]> = {
    Unitel: ['92', '93', '94'],
    Movicel: ['91', '99'],
    Africell: ['95'],
};

/** Só os 9 dígitos nacionais (sem +244 / 00244). */
export const digitosNacionais = (valor: string) => {
    let digitos = String(valor || '').replace(/\D/g, '');
    if (digitos.startsWith('00244')) digitos = digitos.slice(5);
    // "+244" sozinho (campo só com o indicativo) conta como vazio.
    else if (digitos.startsWith('244') && (digitos.length > 9 || digitos.length === 3)) digitos = digitos.slice(3);
    return digitos;
};

export const analisarTelefoneAngola = (valor: string): ResultadoTelefone => {
    const digitos = digitosNacionais(valor);
    if (!digitos) return { valido: false, operadora: null, fixo: false, mensagem: 'Indique o número de telefone.' };
    if (digitos.length !== 9) {
        return { valido: false, operadora: null, fixo: false, mensagem: `O número tem ${digitos.length} dígitos; um número de Angola tem 9.` };
    }
    const numero = `+244${digitos}`;
    if (digitos.startsWith('2')) return { valido: true, numero, operadora: null, fixo: true, mensagem: 'Telefone fixo' };
    const prefixo = digitos.slice(0, 2);
    const operadora = (Object.keys(PREFIXOS_MOVEIS) as OperadoraMovel[]).find(nome => PREFIXOS_MOVEIS[nome].includes(prefixo)) || null;
    if (!operadora) {
        return { valido: false, numero, operadora: null, fixo: false, mensagem: `O prefixo ${prefixo} não pertence a nenhuma operadora de Angola (Unitel, Movicel ou Africell).` };
    }
    return { valido: true, numero, operadora, fixo: false, mensagem: operadora };
};

/** Para validações de formulários: vazio é aceite (campo opcional); preenchido tem de ser válido. */
export const telefoneOpcionalValido = (valor?: string | null) => !digitosNacionais(valor || '') || analisarTelefoneAngola(valor || '').valido;
