/**
 * Utilitário para integração com WhatsApp
 */

export const formatWhatsAppNumber = (phone: string): string => {
    // Remover tudo o que não for dígito
    const digits = phone.replace(/\D/g, '');

    // Se já tiver o prefixo 244, retorna. Caso contrário, adiciona.
    // Assumindo números angolanos conforme o contexto do projeto.
    if (digits.startsWith('244')) {
        return digits;
    }

    // Se começar por 9, é um número local sem prefixo
    if (digits.startsWith('9')) {
        return `244${digits}`;
    }

    return digits;
};

export const getWhatsAppLink = (phone: string, message: string): string => {
    const formattedPhone = formatWhatsAppNumber(phone);
    const encodedMessage = encodeURIComponent(message);
    return `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
};

export const openWhatsApp = (phone: string, message: string): void => {
    const link = getWhatsAppLink(phone, message);
    window.open(link, '_blank');
};




