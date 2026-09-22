import { Client, Credit, Payment } from '@/tipos/credito';

/**
 * Gera ficheiro SAF-T (AO) - Standard Audit File for Tax Purposes
 * Conforme normas da AGT (Administração Geral Tributária) de Angola
 */

export interface SAFTOptions {
    fiscalYear: number;
    startDate: Date;
    endDate: Date;
}

type CompanySettings = {
    name: string;
    nif?: string;
    address?: string;
    phone?: string;
    email?: string;
    currency?: string;
    logo?: string;
    location?: string;
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

export const generateSAFT = (
    companySettings: CompanySettings,
    clients: Client[],
    credits: Credit[],
    payments: Payment[],
    options: SAFTOptions
): string => {
    const { fiscalYear, startDate, endDate } = options;
    const now = new Date();

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01">\n`;

    // ========== HEADER ==========
    xml += `  <Header>\n`;
    xml += `    <AuditFileVersion>1.01_01</AuditFileVersion>\n`;
    xml += `    <CompanyID>${escapeXML(companySettings.nif || 'N/A')}</CompanyID>\n`;
    xml += `    <TaxRegistrationNumber>${escapeXML(companySettings.nif || 'N/A')}</TaxRegistrationNumber>\n`;
    xml += `    <TaxAccountingBasis>F</TaxAccountingBasis>\n`;
    xml += `    <CompanyName>${escapeXML(companySettings.name)}</CompanyName>\n`;
    xml += `    <BusinessName>${escapeXML(companySettings.name)}</BusinessName>\n`;
    xml += `    <CompanyAddress>\n`;
    xml += `      <AddressDetail>${escapeXML(companySettings.address || (companySettings.location ? companySettings.location + ', Angola' : 'Luanda, Angola'))}</AddressDetail>\n`;
    xml += `      <City>${escapeXML(companySettings.location || 'Luanda')}</City>\n`;
    xml += `      <PostalCode>0000</PostalCode>\n`;
    xml += `      <Country>AO</Country>\n`;
    xml += `    </CompanyAddress>\n`;
    xml += `    <FiscalYear>${fiscalYear}</FiscalYear>\n`;
    xml += `    <StartDate>${formatDate(startDate)}</StartDate>\n`;
    xml += `    <EndDate>${formatDate(endDate)}</EndDate>\n`;
    xml += `    <CurrencyCode>AOA</CurrencyCode>\n`;
    xml += `    <DateCreated>${formatDate(now)}</DateCreated>\n`;
    xml += `    <TaxEntity>Global</TaxEntity>\n`;
    xml += `    <ProductCompanyTaxID>${escapeXML(companySettings.nif || 'N/A')}</ProductCompanyTaxID>\n`;
    xml += `    <SoftwareCertificateNumber>0</SoftwareCertificateNumber>\n`;
    xml += `    <ProductID>TangoGestaoCreditoERP</ProductID>\n`;
    xml += `    <ProductVersion>1.0</ProductVersion>\n`;
    xml += `    <HeaderComment>Ficheiro SAF-T gerado automaticamente pelo sistema Tango Gestão de Créditos</HeaderComment>\n`;
    xml += `  </Header>\n`;

    // ========== MASTER FILES ==========
    xml += `  <MasterFiles>\n`;

    // Customers
    xml += `    <Customer>\n`;
    clients.forEach((client, index) => {
        xml += `      <CustomerID>${escapeXML(client.id)}</CustomerID>\n`;
        xml += `      <AccountID>${String(index + 1).padStart(6, '0')}</AccountID>\n`;
        xml += `      <CustomerTaxID>${escapeXML(client.nif || 'N/A')}</CustomerTaxID>\n`;
        xml += `      <CompanyName>${escapeXML(client.name)}</CompanyName>\n`;
        xml += `      <BillingAddress>\n`;
        xml += `        <AddressDetail>${escapeXML(client.address || 'N/A')}</AddressDetail>\n`;
        xml += `        <City>Luanda</City>\n`;
        xml += `        <PostalCode>0000</PostalCode>\n`;
        xml += `        <Country>AO</Country>\n`;
        xml += `      </BillingAddress>\n`;
        xml += `      <Telephone>${escapeXML(client.phone || 'N/A')}</Telephone>\n`;
        xml += `      <Email>${escapeXML(client.email || 'N/A')}</Email>\n`;
        xml += `      <SelfBillingIndicator>0</SelfBillingIndicator>\n`;
    });
    xml += `    </Customer>\n`;

    // Tax Table
    xml += `    <TaxTable>\n`;
    xml += `      <TaxTableEntry>\n`;
    xml += `        <TaxType>IVA</TaxType>\n`;
    xml += `        <TaxCountryRegion>AO</TaxCountryRegion>\n`;
    xml += `        <TaxCode>NOR</TaxCode>\n`;
    xml += `        <Description>IVA - Taxa Normal</Description>\n`;
    xml += `        <TaxPercentage>14.00</TaxPercentage>\n`;
    xml += `      </TaxTableEntry>\n`;
    xml += `      <TaxTableEntry>\n`;
    xml += `        <TaxType>IVA</TaxType>\n`;
    xml += `        <TaxCountryRegion>AO</TaxCountryRegion>\n`;
    xml += `        <TaxCode>ISE</TaxCode>\n`;
    xml += `        <Description>IVA - Isento</Description>\n`;
    xml += `        <TaxPercentage>0.00</TaxPercentage>\n`;
    xml += `      </TaxTableEntry>\n`;
    xml += `    </TaxTable>\n`;

    xml += `  </MasterFiles>\n`;

    // ========== SOURCE DOCUMENTS ==========
    xml += `  <SourceDocuments>\n`;
    xml += `    <SalesInvoices>\n`;
    xml += `      <NumberOfEntries>0</NumberOfEntries>\n`;
    xml += `      <TotalDebit>0.00</TotalDebit>\n`;
    xml += `      <TotalCredit>0.00</TotalCredit>\n`;
    xml += `    </SalesInvoices>\n`;
    
    // Payments (Recibos de Pagamento)
    const activePayments = payments.filter(p => p.status !== 'cancelled');
    const totalPaymentsAmount = activePayments.reduce((acc, p) => acc + (p.amount || 0), 0);
    
    xml += `    <Payments>\n`;
    xml += `      <NumberOfEntries>${activePayments.length}</NumberOfEntries>\n`;
    xml += `      <TotalDebit>0.00</TotalDebit>\n`;
    xml += `      <TotalCredit>${totalPaymentsAmount.toFixed(2)}</TotalCredit>\n`;
    
    activePayments.forEach((payment) => {
        const credit = credits.find(c => c.id === payment.creditId);
        const client = clients.find(cl => cl.id === credit?.clientId);
        const pDate = new Date(payment.paymentDate);
        
        xml += `      <Payment>\n`;
        xml += `        <PaymentRefNo>RE ${payment.id.substring(0, 8)}</PaymentRefNo>\n`;
        xml += `        <Period>${pDate.getMonth() + 1}</Period>\n`;
        xml += `        <PaymentDate>${formatDate(pDate)}</PaymentDate>\n`;
        xml += `        <PaymentType>RC</PaymentType>\n`;
        xml += `        <Description>Recibo de Pagamento - Crédito</Description>\n`;
        xml += `        <CustomerID>${escapeXML(client?.id || 'N/A')}</CustomerID>\n`;
        xml += `        <SourceID>Sistema</SourceID>\n`;
        xml += `        <SystemEntryDate>${formatDateTime(pDate)}</SystemEntryDate>\n`;
        xml += `        <DocumentStatus>\n`;
        xml += `          <PaymentStatus>N</PaymentStatus>\n`;
        xml += `          <PaymentStatusDate>${formatDateTime(pDate)}</PaymentStatusDate>\n`;
        xml += `          <SourceID>Sistema</SourceID>\n`;
        xml += `          <SourcePayment>P</SourcePayment>\n`;
        xml += `        </DocumentStatus>\n`;
        xml += `        <Line>\n`;
        xml += `          <LineNumber>1</LineNumber>\n`;
        xml += `          <SourceDocumentID>CR ${payment.creditId.substring(0, 8)}</SourceDocumentID>\n`;
        xml += `          <CreditAmount>${payment.amount.toFixed(2)}</CreditAmount>\n`;
        xml += `        </Line>\n`;
        xml += `        <DocumentTotals>\n`;
        xml += `          <TaxPayable>0.00</TaxPayable>\n`;
        xml += `          <NetTotal>${payment.amount.toFixed(2)}</NetTotal>\n`;
        xml += `          <GrossTotal>${payment.amount.toFixed(2)}</GrossTotal>\n`;
        xml += `        </DocumentTotals>\n`;
        xml += `      </Payment>\n`;
    });

    xml += `    </Payments>\n`;
    xml += `  </SourceDocuments>\n`;

    xml += `</AuditFile>`;

    return xml;
};

export const downloadSAFT = (xml: string, filename: string) => {
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
