// Payment Gateway Types for Angola
export type PaymentProvider =
    | 'multicaixa_express'
    | 'emis_gpo'
    | 'proxypay'
    | 'appypay'
    | 'plinqpay'
    | 'bayqi'
    | 'kamba'
    | 'unitel_money'
    | 'afrimoney'
    | 'bank_transfer'
    | 'custom';

export interface PaymentGateway {
    id: string;
    name: string;
    provider: PaymentProvider;
    type: 'express' | 'reference' | 'transfer' | 'api';
    status: 'active' | 'inactive' | 'testing';
    environment: 'sandbox' | 'production';

    // API Credentials
    apiKey?: string;
    apiSecret?: string;
    merchantId?: string;
    webhookUrl?: string;
    webhookSecret?: string;

    // Configuration
    config?: string; // JSON string

    // Fees
    transactionFee: number;
    feeType: 'percentage' | 'fixed';

    // Metadata
    logo?: string;
    description?: string;
    supportedMethods?: string; // JSON array

    // Timestamps
    createdAt: string;
    updatedAt?: string;
    lastTestedAt?: string;
    lastTestResult?: 'success' | 'failed' | null;
}

export interface GatewayTestResult {
    success: boolean;
    message: string;
    latency?: number;
    details?: any;
}

export interface GatewayTemplate {
    name: string;
    provider: PaymentProvider;
    logo: string;
    description: string;
    supportedMethods: string[];
    sandboxUrl?: string;
    productionUrl?: string;
    docsUrl?: string;
}

export const GATEWAY_TEMPLATES: Record<PaymentProvider, GatewayTemplate> = {
    multicaixa_express: {
        name: 'Multicaixa Express (MCX)',
        provider: 'multicaixa_express',
        logo: 'multicaixa_express',
        description: 'Pagamentos móveis instantâneos via telemóvel e cartão Multicaixa (Rede EMIS)',
        supportedMethods: ['mcx_express', 'card', 'mobile'],
        sandboxUrl: 'https://sandbox.emis.co.ao/api/v1',
        productionUrl: 'https://api.emis.co.ao/api/v1',
        docsUrl: 'https://emis.co.ao/multicaixa-express'
    },
    proxypay: {
        name: 'ProxyPay Angola',
        provider: 'proxypay',
        logo: 'proxypay',
        description: 'Emissão e conciliação automática de Referências Multicaixa com Webhooks em tempo real',
        supportedMethods: ['reference', 'webhook'],
        sandboxUrl: 'https://api.sandbox.proxypay.co.ao',
        productionUrl: 'https://api.proxypay.co.ao',
        docsUrl: 'https://docs.proxypay.co.ao'
    },
    appypay: {
        name: 'AppyPay',
        provider: 'appypay',
        logo: 'appypay',
        description: 'Gateway angolano para Multicaixa Express, Cartões Visa/Mastercard e Referências EMIS',
        supportedMethods: ['mcx_express', 'reference', 'card'],
        sandboxUrl: 'https://sandbox.appypay.ao/v1',
        productionUrl: 'https://api.appypay.ao/v1',
        docsUrl: 'https://docs.appypay.ao'
    },
    plinqpay: {
        name: 'PlinqPay',
        provider: 'plinqpay',
        logo: 'plinqpay',
        description: 'Infraestrutura completa de pagamentos - Referências, Multicaixa Express e Carteiras',
        supportedMethods: ['reference', 'mcx_express', 'wallet'],
        sandboxUrl: 'https://sandbox.plinqpay.com/api',
        productionUrl: 'https://api.plinqpay.com',
        docsUrl: 'https://plinqpay.com/docs'
    },
    emis_gpo: {
        name: 'EMIS GPO (Gateway de Pagamentos Online)',
        provider: 'emis_gpo',
        logo: 'emis_gpo',
        description: 'Gateway oficial interbancário da EMIS para Pagamentos por Referência e ATM',
        supportedMethods: ['reference', 'atm'],
        sandboxUrl: 'https://sandbox.gpo.emis.co.ao',
        productionUrl: 'https://gpo.emis.co.ao',
        docsUrl: 'https://emis.co.ao'
    },
    bayqi: {
        name: 'BayQi Pagamentos',
        provider: 'bayqi',
        logo: 'bayqi',
        description: 'Carteira digital, checkout para e-commerce e pagamentos Multicaixa Express',
        supportedMethods: ['wallet', 'mcx_express', 'reference'],
        sandboxUrl: 'https://sandbox.bayqi.com/api',
        productionUrl: 'https://api.bayqi.com',
        docsUrl: 'https://developer.bayqi.com'
    },
    kamba: {
        name: 'Kamba Pagamentos',
        provider: 'kamba',
        logo: 'kamba',
        description: 'Carteira digital angolana, pagamentos móveis e API de checkout',
        supportedMethods: ['wallet', 'mcx_express', 'qr_code'],
        sandboxUrl: 'https://sandbox.kamba.co.ao/api/v1',
        productionUrl: 'https://api.kamba.co.ao/api/v1',
        docsUrl: 'https://kamba.co.ao/developers'
    },
    unitel_money: {
        name: 'Unitel Money',
        provider: 'unitel_money',
        logo: 'unitel_money',
        description: 'Carteira de dinheiro móvel da Unitel para depósitos, transferências e pagamentos',
        supportedMethods: ['mobile_money', 'ussd', 'qr_code'],
        sandboxUrl: 'https://sandbox.unitelmoney.ao/api',
        productionUrl: 'https://api.unitelmoney.ao',
        docsUrl: 'https://unitel.ao/unitel-money'
    },
    afrimoney: {
        name: 'Afrimoney (Africell)',
        provider: 'afrimoney',
        logo: 'afrimoney',
        description: 'Serviço financeiro móvel da Africell Angola para pagamentos rápidos',
        supportedMethods: ['mobile_money', 'ussd'],
        sandboxUrl: 'https://sandbox.afrimoney.ao/api',
        productionUrl: 'https://api.afrimoney.ao',
        docsUrl: 'https://africell.ao/afrimoney'
    },
    bank_transfer: {
        name: 'Transferência Bancária (IBAN AO06)',
        provider: 'bank_transfer',
        logo: 'bank_transfer',
        description: 'Transferências interbancárias diretas (BAI, BFA, BIC, BMA, SOL, Keve) com validação de comprovativo',
        supportedMethods: ['transfer', 'iban']
    },
    custom: {
        name: 'API Personalizada / Outro Gateway',
        provider: 'custom',
        logo: 'bank_transfer',
        description: 'Integração com API de pagamento proprietária ou outro provedor angolano',
        supportedMethods: ['api']
    }
};

export interface PaymentReference {
    id: string;
    creditId: string;
    gatewayId: string;
    reference: string;
    entity?: string;
    amount: number;
    status: 'pending' | 'pending_validation' | 'completed' | 'failed' | 'expired';
    proofImage?: string;
    expiresAt?: string;
    paidAt?: string;
    submittedAt?: string;
    createdAt: string;
}
