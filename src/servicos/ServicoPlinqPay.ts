import { PaymentGateway } from '@/tipos/pagamento';

/**
 * Serviço de integração com PlinqPay API
 * Documentação: https://plinqpay.com/docs
 */

export interface PlinqPayConfig {
    apiKey: string;
    merchantId: string;
    environment: 'sandbox' | 'production';
    webhookSecret?: string;
}

export interface PlinqPayReferenceRequest {
    amount: number;
    description: string;
    expiresIn?: number; // em horas, padrão 24h
    metadata?: Record<string, any>;
}

export interface PlinqPayReferenceResponse {
    success: boolean;
    reference?: string;
    entity?: string;
    amount: number;
    expiresAt?: string;
    status: 'pending' | 'completed' | 'expired' | 'failed';
    message?: string;
}

export interface PlinqPayStatusResponse {
    success: boolean;
    status: 'pending' | 'completed' | 'expired' | 'failed';
    paidAt?: string;
    amount?: number;
    message?: string;
}

export interface PlinqPayWebhookPayload {
    event: 'payment.completed' | 'payment.failed' | 'payment.expired';
    reference: string;
    amount: number;
    paidAt?: string;
    signature: string;
    metadata?: Record<string, any>;
}

export class ServicoPlinqPay {
    private config: PlinqPayConfig;
    private baseUrl: string;

    constructor(gateway: PaymentGateway) {
        this.config = {
            apiKey: gateway.apiKey || '',
            merchantId: gateway.merchantId || '',
            environment: gateway.environment,
            webhookSecret: gateway.webhookSecret
        };

        this.baseUrl = gateway.environment === 'sandbox'
            ? 'https://sandbox.plinqpay.com/api'
            : 'https://api.plinqpay.com';
    }

    /**
     * Gera uma nova referência de pagamento
     */
    async generateReference(request: PlinqPayReferenceRequest): Promise<PlinqPayReferenceResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/reference/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'X-Merchant-ID': this.config.merchantId
                },
                body: JSON.stringify({
                    amount: request.amount,
                    description: request.description,
                    expiresIn: request.expiresIn || 24,
                    metadata: request.metadata
                })
            });

            if (!response.ok) {
                const error = await response.json();
                return {
                    success: false,
                    amount: request.amount,
                    status: 'failed',
                    message: error.message || 'Erro ao gerar referência'
                };
            }

            const data = await response.json();
            return {
                success: true,
                reference: data.reference,
                entity: data.entity,
                amount: data.amount,
                expiresAt: data.expiresAt,
                status: 'pending'
            };
        } catch (error: any) {
            console.error('[PlinqPay] Erro ao gerar referência:', error);
            return {
                success: false,
                amount: request.amount,
                status: 'failed',
                message: error.message || 'Erro de conexão com PlinqPay'
            };
        }
    }

    /**
     * Verifica o status de uma referência de pagamento
     */
    async checkStatus(reference: string): Promise<PlinqPayStatusResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/reference/${reference}/status`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'X-Merchant-ID': this.config.merchantId
                }
            });

            if (!response.ok) {
                const error = await response.json();
                return {
                    success: false,
                    status: 'failed',
                    message: error.message || 'Erro ao verificar status'
                };
            }

            const data = await response.json();
            return {
                success: true,
                status: data.status,
                paidAt: data.paidAt,
                amount: data.amount
            };
        } catch (error: any) {
            console.error('[PlinqPay] Erro ao verificar status:', error);
            return {
                success: false,
                status: 'failed',
                message: error.message || 'Erro de conexão com PlinqPay'
            };
        }
    }

    /**
     * Valida a assinatura de um webhook do PlinqPay
     */
    validateWebhookSignature(payload: PlinqPayWebhookPayload): boolean {
        if (!this.config.webhookSecret) {
            console.warn('[PlinqPay] Webhook secret não configurado');
            return false;
        }

        try {
            // Implementar validação de assinatura conforme documentação PlinqPay
            // Exemplo: HMAC SHA256
            const crypto = require('crypto');
            const expectedSignature = crypto
                .createHmac('sha256', this.config.webhookSecret)
                .update(JSON.stringify({
                    event: payload.event,
                    reference: payload.reference,
                    amount: payload.amount,
                    paidAt: payload.paidAt
                }))
                .digest('hex');

            return expectedSignature === payload.signature;
        } catch (error) {
            console.error('[PlinqPay] Erro ao validar assinatura:', error);
            return false;
        }
    }

    /**
     * Testa a conexão com a API PlinqPay
     */
    async testConnection(): Promise<{ success: boolean; message: string; latency?: number }> {
        const startTime = Date.now();

        try {
            const response = await fetch(`${this.baseUrl}/health`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'X-Merchant-ID': this.config.merchantId
                }
            });

            const latency = Date.now() - startTime;

            if (!response.ok) {
                return {
                    success: false,
                    message: 'Credenciais inválidas ou API indisponível',
                    latency
                };
            }

            return {
                success: true,
                message: 'Conexão estabelecida com sucesso',
                latency
            };
        } catch (error: any) {
            const latency = Date.now() - startTime;
            return {
                success: false,
                message: error.message || 'Erro de conexão',
                latency
            };
        }
    }
}
