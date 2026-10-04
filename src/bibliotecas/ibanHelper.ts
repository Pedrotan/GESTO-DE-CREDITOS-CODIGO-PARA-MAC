// Lista completa de bancos autorizados em Angola (2024/2025)
// Fonte: Banco Nacional de Angola (BNA) e Associação Angolana de Bancos (ABANC)
export const ANGOLAN_BANKS = [
    { code: '0040', name: 'BAI - Banco Angolano de Investimentos', shortName: 'BAI' },
    { code: '0051', name: 'BIC - Banco BIC Angola', shortName: 'BIC' },
    { code: '0004', name: 'BCGA - Banco Caixa Geral Angola', shortName: 'BCGA' },
    { code: '0043', name: 'BCA - Banco Comercial Angolano', shortName: 'BCA' },
    { code: '0059', name: 'BCH - Banco Comercial do Huambo', shortName: 'BCH' },
    { code: '0005', name: 'BCI - Banco de Comércio e Indústria', shortName: 'BCI' },
    { code: '0070', name: 'BCS - Banco de Crédito do Sul', shortName: 'BCS' },
    { code: '0054', name: 'BDA - Banco de Desenvolvimento de Angola', shortName: 'BDA' },
    { code: '0045', name: 'BE - Banco Económico', shortName: 'BE' },
    { code: '0006', name: 'BFA - Banco de Fomento Angola', shortName: 'BFA' },
    { code: '0067', name: 'BIR - Banco de Investimento Rural', shortName: 'BIR' },
    { code: '0053', name: 'BKI - Banco Kwanza Invest', shortName: 'BKI' },
    { code: '0047', name: 'Banco Keve', shortName: 'Keve' },
    { code: '0055', name: 'BMA - Banco Millennium Atlântico', shortName: 'Atlântico' },
    { code: '0052', name: 'BNI - Banco de Negócios Internacional', shortName: 'BNI' },
    { code: '0071', name: 'BOC - Banco da China (Sucursal Luanda)', shortName: 'BOC' },
    { code: '0010', name: 'BPC - Banco de Poupança e Crédito', shortName: 'BPC' },
    { code: '0064', name: 'BPP - Banco Prestígio', shortName: 'Prestígio' },
    { code: '0044', name: 'Banco Sol', shortName: 'Sol' },
    { code: '0062', name: 'BVB - Banco Valor', shortName: 'Valor' },
    { code: '0066', name: 'Banco Yetu', shortName: 'Yetu' },
    { code: '0060', name: 'SBA - Standard Bank de Angola', shortName: 'Standard' },
    { code: '0063', name: 'SCBA - Standard Chartered Bank Angola', shortName: 'SC' },
    { code: '0056', name: 'VTB - Banco VTB África', shortName: 'VTB' },
    { code: '0001', name: 'Access Bank Angola', shortName: 'Access' },
    { code: '0048', name: 'BMF - Banco BAI Microfinanças', shortName: 'BMF' },
    { code: '0065', name: 'Banco Mais', shortName: 'Mais' },
    { code: '0058', name: 'Finibanco Angola', shortName: 'Finibanco' },
    { code: '0073', name: 'Banco Tchoni', shortName: 'Tchoni' },
] as const;

/**
 * Formata um IBAN angolano com espaços
 * Formato: AO06 0044 0000 6729 5030 1010 2
 */
export const formatAngolanIBAN = (value: string): string => {
    // Remove tudo que não é letra ou número
    let clean = value.replace(/[^A-Z0-9]/gi, '').toUpperCase();

    if (clean.length === 0) return '';

    // Garante que começa com AO06
    if (!clean.startsWith('AO06')) {
        // Se começar com AO mas não com AO06, pode ser o início da digitação ou erro
        if (clean.startsWith('AO')) {
            // Preservamos o que vem depois dos primeiros caracteres se parecerem dígitos
            const remainder = clean.slice(2);
            // Se o que restar começar com '06', mantemos, senão forçamos
            if (remainder.startsWith('06')) {
                clean = 'AO' + remainder;
            } else {
                // Removemos dígitos iniciais que não sejam 06 para evitar duplicar
                clean = 'AO06' + remainder.replace(/^06/, '');
            }
        } else {
            // Se começou com dígitos do código do banco diretamente, forçamos o prefixo
            clean = 'AO06' + clean;
        }
    }

    // Limita a 25 caracteres (AO06 + 21 dígitos)
    const limited = clean.slice(0, 25);

    // Formata com espaços: AO06 0044 0000 6729 5030 1010 2
    const parts = [];
    for (let i = 0; i < limited.length; i += 4) {
        parts.push(limited.slice(i, i + 4));
    }

    return parts.join(' ');
};

/**
 * Identifica o banco pelo código IBAN
 */
export const identifyBankFromIBAN = (iban: string): typeof ANGOLAN_BANKS[number] | null => {
    const clean = iban.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (clean.length < 8) return null;

    // O código do banco está nas posições 4-7 (após AO e 2 dígitos de controle)
    const bankCode = clean.slice(4, 8);

    return ANGOLAN_BANKS.find(bank => bank.code === bankCode) || null;
};

/**
 * Valida se um IBAN angolano está completo
 */
export const validateAngolanIBAN = (iban: string): boolean => {
    const clean = iban.replace(/[^A-Z0-9]/gi, '').toUpperCase();

    // Deve ter exatamente 25 caracteres
    if (clean.length !== 25) return false;

    // Deve começar com AO
    if (!clean.startsWith('AO')) return false;

    // Os próximos 23 caracteres devem ser dígitos
    const digits = clean.slice(2);
    if (!/^\d{23}$/.test(digits)) return false;

    return true;
};





// Logotipos oficiais (fonte: ABANC, https://abanc.ao/?page_id=385), guardados em public/bancos/<código>.
const BANK_LOGO_FILES: Record<string, string> = {
    '0040': 'webp', '0004': 'webp', '0005': 'webp', '0071': 'webp', '0045': 'webp', '0052': 'webp', '0051': 'webp',
    '0043': 'webp', '0064': 'webp', '0059': 'webp', '0054': 'webp', '0006': 'webp', '0067': 'webp', '0053': 'webp',
    '0048': 'webp', '0010': 'webp', '0055': 'webp', '0047': 'webp', '0062': 'webp', '0058': 'webp', '0044': 'webp',
    '0060': 'jpg', '0056': 'webp', '0070': 'webp', '0066': 'webp', '0065': 'webp',
};

/** URL do logotipo do banco (ou null se não houver). */
export const getBankLogoUrl = (bankCode?: string | null): string | null => {
    const ext = bankCode ? BANK_LOGO_FILES[bankCode] : undefined;
    return ext ? `${import.meta.env.BASE_URL}bancos/${bankCode}.${ext}` : null;
};
