// Template de Mensagens WhatsApp para Pagamentos
// Adicione estes templates ao sistema

export const PAYMENT_MESSAGE_TEMPLATES = {
    // 1. Dados para Transferência Bancária
    bankTransfer: (data: {
        clientName: string;
        creditId: string;
        amount: number;
        reference: string;
        bankName: string;
        iban: string;
        accountName: string;
        expiresAt: Date;
    }) => `
 *DADOS PARA PAGAMENTO*

Olâ ${data.clientName}!

Para pagar o seu crédito #${data.creditId}, faça uma transferência com os seguintes dados:

 *Valor:* ${formatCurrency(data.amount)}

 *Banco:* ${data.bankName}
 *IBAN:* ${data.iban}
 *Titular:* ${data.accountName}

 *IMPORTANTE:*
No campo "Descrição" ou "Referência" da transferência, coloque:
 *${data.reference}*

 Válido até: ${formatDate(data.expiresAt)}

Após fazer a transferência, envie o comprovativo para este número.

Obrigado!
    `.trim(),

    // 2. Confirmação de Comprovativo Recebido
    proofReceived: (data: {
        clientName: string;
        reference: string;
    }) => `
 *COMPROVATIVO RECEBIDO*

Olá ${data.clientName}!

Recebemos o seu comprovativo de pagamento (Ref: ${data.reference}).

 Estamos a validar e em breve confirmaremos o pagamento.

Aguarde 1-2 horas úteis.

Obrigado pela confiança!
    `.trim(),

    // 3. Pagamento Confirmado
    paymentConfirmed: (data: {
        clientName: string;
        amount: number;
        creditId: string;
        remainingBalance: number;
    }) => `
 *PAGAMENTO CONFIRMADO!*

Olá ${data.clientName}!

Confirmamos o recebimento do seu pagamento:

 *Valor Pago:* ${formatCurrency(data.amount)}
 *Crédito:* #${data.creditId}
 *Saldo Restante:* ${formatCurrency(data.remainingBalance)}

${data.remainingBalance === 0
            ? ' *CRÉDITO TOTALMENTE PAGO!* Parabéns! '
            : ''}

Obrigado! Continue connosco!
    `.trim(),

    // 4. Dados para Unitel Money
    unitelMoney: (data: {
        clientName: string;
        creditId: string;
        amount: number;
        reference: string;
        unitelNumber: string;
        accountName: string;
    }) => `
 *PAGAMENTO VIA UNITEL MONEY*

Olá ${data.clientName}!

Para pagar o seu crédito #${data.creditId}:

 *Valor:* ${formatCurrency(data.amount)}

*PASSO A PASSO:*
1. Abra o app *Unitel Money*        
2. Vá em *Pagamentos* -> *Serviços*
3. Procure por *${data.accountName}*
4. Digite o valor: *${data.amount} AOA*
5. Referência: *${data.reference}*
6. Confirme com o seu PIN

Ou envie para o número:
 *${data.unitelNumber}*

Receberá confirmação automática!

Obrigado!
    `.trim(),

    // 5. Lembrete de Pagamento Pendente
    paymentReminder: (data: {
        clientName: string;
        creditId: string;
        daysOverdue: number;
        amount: number;
    }) => `
 *LEMBRETE DE PAGAMENTO*

Olá ${data.clientName}!

O pagamento do crédito #${data.creditId} está pendente há ${data.daysOverdue} dias.

 *Valor em atraso:* ${formatCurrency(data.amount)}

Por favor, regularize a situação o mais breve possível.

Precisa de ajuda? Responda esta mensagem!

Obrigado pela compreensão!
    `.trim(),

    // 6. Dados para Pagamento em Agente
    agentPayment: (data: {
        clientName: string;
        creditId: string;
        amount: number;
        clientCode: string;
        agentName: string;
        agentAddress: string;
        agentPhone: string;
    }) => `
 *PAGAMENTO EM AGENTE*

Olá ${data.clientName}!

Para pagar o seu crédito #${data.creditId} em dinheiro:

 *Valor:* ${formatCurrency(data.amount)}
 *Seu Código:* ${data.clientCode}

 *AGENTE MAIS PRÓXIMO:*
 ${data.agentName}
 ${data.agentAddress}
 ${data.agentPhone}

*IMPORTANTE:*
Leve o seu *código (${data.clientCode})* e um documento de identificação.

O agente emitirá um recibo e você receberá confirmação por SMS.

Obrigado!
    `.trim(),

    // 7. Pagamento Expirado
    paymentExpired: (data: {
        clientName: string;
        reference: string;
    }) => `
 *REFERÊNCIA EXPIRADA*

Olá ${data.clientName}!

A referência de pagamento ${data.reference} expirou.

Por favor, solicite uma nova referência respondendo:
*NOVA REFERÊNCIA*

Ou contacte-nos para mais informações.

Obrigado!
    `.trim(),
};

// Funções auxiliares
function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('pt-AO', {
        style: 'currency',
        currency: 'AOA',
        minimumFractionDigits: 0
    }).format(amount);
}

function formatDate(date: Date): string {
    return new Intl.DateTimeFormat('pt-PT', {
        dateStyle: 'full',
        timeStyle: 'short'
    }).format(date);
}

// Exemplo de uso no sistema
/*
import { PAYMENT_MESSAGE_TEMPLATES } from '@/bibliotecas/payment-templates';

// Ao gerar referência de transferência
const message = PAYMENT_MESSAGE_TEMPLATES.bankTransfer({
    clientName: 'João Silva',
    creditId: 'CRED-2026-001',
    amount: 50000,
    reference: 'CRED-2026-001',
    bankName: 'BIC',
    iban: 'AO06 0040 0000 1234 5678 9012 3',
    accountName: 'Sua Empresa Lda',
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
});

// Enviar via WhatsApp
await sendWhatsApp(client.phone, message);
*/




