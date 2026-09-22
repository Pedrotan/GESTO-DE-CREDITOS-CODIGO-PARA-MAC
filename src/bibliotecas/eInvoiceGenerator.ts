import { Credit, Client } from '@/tipos/credito';

/**
 * Gera Factura Electrónica conforme padrões AGT Angola
 * Obrigatório desde 1 de Janeiro de 2026
 */

type CompanySettings = {
    name: string;
    nif?: string;
    address?: string;
    phone?: string;
    email?: string;
    currency?: string;
    [key: string]: any;
};

const safeDate = (date: Date | string | undefined): Date => {
    if (!date) return new Date();
    const d = new Date(date);
    return isNaN(d.getTime()) ? new Date() : d;
};

const formatDate = (date: Date | string): string => {
    return safeDate(date).toISOString().split('T')[0];
};

const formatDateTime = (date: Date | string): string => {
    return safeDate(date).toISOString();
};

const escapeXML = (str: string): string => {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
};

// Gera hash simples para a factura (em produção, usar algoritmo certificado pela AGT)
const generateHash = (invoiceData: string): string => {
    let hash = 0;
    for (let i = 0; i < invoiceData.length; i++) {
        const char = invoiceData.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).toUpperCase().padStart(40, '0');
};

// Gera QR Code data (simplificado)
const generateQRCode = (invoiceNo: string, nif: string, total: number, date: string): string => {
    return `${invoiceNo}*${nif}*${date}*${total.toFixed(2)}*${generateHash(invoiceNo + nif + date)}`;
};

export interface EInvoiceData {
    invoiceNo: string;
    credit: Credit;
    client: Client;
    companySettings: CompanySettings;
    userName: string;
}

export const generateEInvoice = (data: EInvoiceData): string => {
    const { invoiceNo, credit, client, companySettings, userName } = data;
    const now = new Date();
    const invoiceDate = safeDate(credit.startDate);

    // Cálculos
    const netTotal = credit.principalAmount;
    const taxRate = 0; // Serviços financeiros geralmente isentos
    const taxPayable = netTotal * taxRate;
    const grossTotal = netTotal + taxPayable;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<Invoice xmlns="urn:AGT:eInvoice:AO:1.0">\n`;

    // Identificação da Factura
    xml += `  <InvoiceNo>${escapeXML(invoiceNo)}</InvoiceNo>\n`;
    xml += `  <ATCUD>0</ATCUD>\n`;
    xml += `  <InvoiceDate>${formatDate(invoiceDate)}</InvoiceDate>\n`;
    xml += `  <InvoiceType>FT</InvoiceType>\n`;
    xml += `  <SelfBillingIndicator>0</SelfBillingIndicator>\n`;
    xml += `  <SourceID>${escapeXML(userName)}</SourceID>\n`;
    xml += `  <SystemEntryDate>${formatDateTime(now)}</SystemEntryDate>\n`;

    // Dados do Emitente
    xml += `  <Issuer>\n`;
    xml += `    <CompanyName>${escapeXML(companySettings.name)}</CompanyName>\n`;
    xml += `    <TaxID>${escapeXML(companySettings.nif || 'N/A')}</TaxID>\n`;
    xml += `    <Address>\n`;
    xml += `      <AddressDetail>${escapeXML(companySettings.address || (companySettings.location ? companySettings.location + ', Angola' : 'Luanda, Angola'))}</AddressDetail>\n`;
    xml += `      <City>${escapeXML(companySettings.location || 'Luanda')}</City>\n`;
    xml += `      <PostalCode>0000</PostalCode>\n`;
    xml += `      <Country>AO</Country>\n`;
    xml += `    </Address>\n`;
    xml += `    <Telephone>${escapeXML(companySettings.phone || 'N/A')}</Telephone>\n`;
    xml += `    <Email>${escapeXML(companySettings.email || 'N/A')}</Email>\n`;
    xml += `  </Issuer>\n`;

    // Dados do Cliente
    xml += `  <Customer>\n`;
    xml += `    <CustomerID>${escapeXML(client.id)}</CustomerID>\n`;
    xml += `    <CustomerTaxID>${escapeXML(client.nif || 'N/A')}</CustomerTaxID>\n`;
    xml += `    <CompanyName>${escapeXML(client.name)}</CompanyName>\n`;
    xml += `    <BillingAddress>\n`;
    xml += `      <AddressDetail>${escapeXML(client.address || 'N/A')}</AddressDetail>\n`;
    xml += `      <City>Luanda</City>\n`;
    xml += `      <PostalCode>0000</PostalCode>\n`;
    xml += `      <Country>AO</Country>\n`;
    xml += `    </BillingAddress>\n`;
    xml += `    <Telephone>${escapeXML(client.phone || 'N/A')}</Telephone>\n`;
    xml += `    <Email>${escapeXML(client.email || 'N/A')}</Email>\n`;
    xml += `  </Customer>\n`;

    // Linhas da Factura
    xml += `  <Line>\n`;
    xml += `    <LineNumber>1</LineNumber>\n`;
    xml += `    <ProductCode>CREDITO</ProductCode>\n`;
    xml += `    <ProductDescription>Crédito Financeiro</ProductDescription>\n`;
    xml += `    <Quantity>1.00</Quantity>\n`;
    xml += `    <UnitOfMeasure>UN</UnitOfMeasure>\n`;
    xml += `    <UnitPrice>${netTotal.toFixed(2)}</UnitPrice>\n`;
    xml += `    <TaxPointDate>${formatDate(invoiceDate)}</TaxPointDate>\n`;
    xml += `    <Description>Concessão de crédito financeiro</Description>\n`;
    xml += `    <DebitAmount>${netTotal.toFixed(2)}</DebitAmount>\n`;
    xml += `    <Tax>\n`;
    xml += `      <TaxType>IVA</TaxType>\n`;
    xml += `      <TaxCountryRegion>AO</TaxCountryRegion>\n`;
    xml += `      <TaxCode>ISE</TaxCode>\n`;
    xml += `      <TaxPercentage>${(taxRate * 100).toFixed(2)}</TaxPercentage>\n`;
    xml += `    </Tax>\n`;
    xml += `    <TaxExemptionReason>Serviços financeiros isentos de IVA</TaxExemptionReason>\n`;
    xml += `    <SettlementAmount>0.00</SettlementAmount>\n`;
    xml += `  </Line>\n`;

    // Totais do Documento
    xml += `  <DocumentTotals>\n`;
    xml += `    <TaxPayable>${taxPayable.toFixed(2)}</TaxPayable>\n`;
    xml += `    <NetTotal>${netTotal.toFixed(2)}</NetTotal>\n`;
    xml += `    <GrossTotal>${grossTotal.toFixed(2)}</GrossTotal>\n`;
    xml += `  </DocumentTotals>\n`;

    // Informações de Segurança
    const hashData = invoiceNo + formatDate(invoiceDate) + grossTotal.toFixed(2);
    const hash = generateHash(hashData);
    const qrCode = generateQRCode(invoiceNo, companySettings.nif || '', grossTotal, formatDate(invoiceDate));

    xml += `  <Hash>${hash}</Hash>\n`;
    xml += `  <HashControl>1</HashControl>\n`;
    xml += `  <Period>${invoiceDate.getMonth() + 1}</Period>\n`;
    xml += `  <QRCode>${qrCode}</QRCode>\n`;

    // Informações de Pagamento
    xml += `  <PaymentTerms>Conforme contrato de crédito</PaymentTerms>\n`;
    xml += `  <PaymentMechanism>\n`;
    xml += `    <PaymentMechanismCode>TB</PaymentMechanismCode>\n`;
    xml += `    <PaymentAmount>${grossTotal.toFixed(2)}</PaymentAmount>\n`;

    // Usar dueDate se existir, caso contrário usar data atual + 30 dias
    const paymentDate = credit.dueDate ? safeDate(credit.dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    xml += `    <PaymentDate>${formatDate(paymentDate)}</PaymentDate>\n`;
    xml += `  </PaymentMechanism>\n`;

    xml += `</Invoice>`;

    return xml;
};

export const downloadEInvoice = (xml: string, filename: string) => {
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};




