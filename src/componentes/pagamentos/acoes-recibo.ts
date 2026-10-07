import { formatCurrency } from '@/bibliotecas/formatters';
import { formatLuandaDate } from '@/bibliotecas/fuso-angola';
import { printPdfFromUrl } from '@/bibliotecas/pdfPrint';
import { openWhatsApp } from '@/bibliotecas/whatsapp';
import { generateReceiptA4, generateReceiptThermal, type ReceiptClient } from '@/bibliotecas/recibo-pagamento';
import { dataUrlToBlob, downloadDataUrl } from '@/bibliotecas/relatorios-pagamentos';
import type { PaymentRow } from '@/bibliotecas/pagamentos-analise';

export const receiptClientOf = (row: PaymentRow, clients: any[]): ReceiptClient & { email?: string } => {
    const client = clients.find(item => item.id === row.clientId);
    return { name: client?.name || row.clientName, nif: client?.nif, phone: client?.phone, address: client?.address, email: client?.email };
};

export async function downloadReceipt(row: PaymentRow, clients: any[], settings: any, userName: string, kind: 'a4' | 'thermal' | 'second') {
    const client = receiptClientOf(row, clients);
    if (kind === 'thermal') return generateReceiptThermal(row, client, settings, userName, 'save');
    return generateReceiptA4(row, client, settings, userName, 'save', kind === 'second');
}

export async function printReceipt(row: PaymentRow, clients: any[], settings: any, userName: string, kind: 'a4' | 'thermal', onError: (message?: string) => void) {
    const client = receiptClientOf(row, clients);
    const file = kind === 'thermal'
        ? await generateReceiptThermal(row, client, settings, userName, 'datauri')
        : await generateReceiptA4(row, client, settings, userName, 'datauri');
    const url = URL.createObjectURL(dataUrlToBlob(file.dataUrl));
    await printPdfFromUrl(url, onError, undefined, file.fileName);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const receiptMessage = (row: PaymentRow, companyName: string) =>
    `Olá ${row.clientName}, confirmamos a recepção do seu pagamento de ${formatCurrency(row.total)} (recibo ${row.receipt}) ` +
    `referente ao contrato ${row.contract}, com data-valor ${formatLuandaDate(`${row.valueDateKey}T12:00:00Z`)}.` +
    `${row.balanceAfter !== null ? ` Capital em dívida após o pagamento: ${formatCurrency(row.balanceAfter)}.` : ''} Obrigado. ${companyName}`;

export function sendReceiptWhatsApp(row: PaymentRow, clients: any[], companyName: string) {
    const client = receiptClientOf(row, clients);
    if (!client.phone) throw new Error('O cliente não tem telefone registado.');
    openWhatsApp(client.phone, receiptMessage(row, companyName));
}

const smtpReady = (settings: any) => Boolean(settings?.smtpHost && settings?.smtpUser && settings?.smtpPassword && (window as any).electronAPI?.sendEmail);

/**
 * Envia o recibo em PDF por email. Com SMTP configurado (aplicação desktop) segue em anexo; caso contrário,
 * o PDF é descarregado e abre-se o programa de email com a mensagem preparada.
 */
export async function sendReceiptEmail(row: PaymentRow, clients: any[], settings: any, userName: string): Promise<'sent' | 'manual'> {
    const client = receiptClientOf(row, clients);
    if (!client.email) throw new Error(`O cliente ${row.clientName} não tem email registado.`);
    const file = await generateReceiptA4(row, client, settings, userName, 'datauri');
    const subject = `Recibo ${row.receipt} - ${settings?.name || 'Pagamento'}`;
    const text = receiptMessage(row, settings?.name || '');
    if (smtpReady(settings)) {
        const result = await (window as any).electronAPI.sendEmail({
            smtpSettings: { host: settings.smtpHost, port: settings.smtpPort, user: settings.smtpUser, pass: settings.smtpPassword, secure: settings.smtpSecure, fromName: settings.smtpFromName || settings.name },
            emailOptions: { to: client.email, subject, html: `<p>${text}</p>`, attachments: [{ filename: file.fileName, content: file.dataUrl.split(',')[1], encoding: 'base64' }] },
        });
        if (!result?.success) throw new Error(result?.error || 'O servidor de email recusou o envio.');
        return 'sent';
    }
    downloadDataUrl(file.dataUrl, file.fileName);
    window.open(`mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${text}\n\n(O recibo foi descarregado: anexe o ficheiro ${file.fileName}.)`)}`);
    return 'manual';
}

export { smtpReady };
