
import QRCode from 'qrcode';

export interface BankTransferData {
    amount: number;
    reference: string;
    iban: string;
    beneficiary: string;
    bankName: string;
}

/**
 * Generates a QR Code for bank transfer
 * Uses SEPA Credit Transfer standard format (compatible with some apps)
 * or a custom format for internal system scanning
 */
export async function generateBankQRCode(data: BankTransferData): Promise<string> {
    try {
        // Formato compativel com alguns apps (EPC QR Code / SEPA)
        // BCD version
        // 002
        // Encoding: 1 (UTF-8)
        // Function: SCT (SEPA Credit Transfer)
        // BIC: (Optional)
        // Name: Beneficiary Name
        // IBAN: Beneficiary IBAN
        // Amount: EUR10.50 (We use AOA)
        // Purpose: (Optional)
        // Ref: Creditor Reference

        // Adapting for generic use since AOA is not strictly SEPA
        // We focus on providing clean data that can be scanned
        const qrContent = `BANCO:${data.bankName}\nIBAN:${data.iban}\nNOME:${data.beneficiary}\nVALOR:${data.amount} AOA\nREF:${data.reference}`;

        const dataUrl = await QRCode.toDataURL(qrContent, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 300,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });

        return dataUrl;
    } catch (error) {
        console.error('Failed to generate QR code:', error);
        return '';
    }
}

/**
 * Generates a simpler QR Code only with the reference
 * Useful for fast scanning at agent terminals
 */
export async function generateReferenceQRCode(reference: string): Promise<string> {
    try {
        return await QRCode.toDataURL(reference, {
            width: 200,
            margin: 1
        });
    } catch (error) {
        console.error('Error generating reference QR:', error);
        return '';
    }
}




