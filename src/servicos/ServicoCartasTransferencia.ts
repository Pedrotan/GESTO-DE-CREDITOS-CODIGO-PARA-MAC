import { Client, Credit } from '@/tipos/credito';
import { formatCurrency, formatDate } from '@/bibliotecas/formatters';
import { getScopedLocalStorageItem, setScopedLocalStorageItem } from '@/bibliotecas/contas';
import { identifyBankFromIBAN } from '@/bibliotecas/ibanHelper';
import { sanitizeRichHtml } from '@/bibliotecas/sanitizar-html';

export interface CartaTransferencia {
    id: string;
    clientId?: string;
    clientName: string;
    clientNif?: string;
    clientPhone?: string;
    clientBank?: string;
    clientIban?: string;
    clientAccountNumber?: string;
    bankDestinationName: string; // Ex: Banco Angolano de Investimentos (BAI)
    destinationBranch?: string; // Balcão / Agência
    companyAccountName: string;
    companyIban: string;
    companyBank: string;
    installmentAmount: number;
    creditReference?: string;
    startDate: string;
    endDate?: string;
    dayOfMonth: number; // Dia de débito mensal (ex: 28)
    subject: string; // Ex: "SOLICITAÇÃO DE ORDEM DE TRANSFERÊNCIA BANCÁRIA PERMANENTE"
    bodyHtml: string; // Conteúdo formatado Word-style
    templateId?: string;
    observations?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ModeloCarta {
    id: string;
    name: string;
    description: string;
    subject: string;
    bodyHtmlTemplate: string;
    isDefault?: boolean;
}

const STORAGE_KEY = 'tango_cartas_transferencia_permanente';
const TEMPLATES_STORAGE_KEY = 'tango_modelos_cartas_bancarias';

export class ServicoCartasTransferencia {
    static getLetters(): CartaTransferencia[] {
        try {
            const raw = getScopedLocalStorageItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
            const letters: CartaTransferencia[] = raw ? JSON.parse(raw) : [];
            return letters.map(letter => ({ ...letter, bodyHtml: sanitizeRichHtml(letter.bodyHtml) }));
        } catch {
            return [];
        }
    }

    static getLetterById(id: string): CartaTransferencia | undefined {
        const letters = this.getLetters();
        return letters.find(l => l.id === id);
    }

    static saveLetter(letter: CartaTransferencia): CartaTransferencia {
        const letters = this.getLetters();
        const existingIdx = letters.findIndex(l => l.id === letter.id);
        const now = new Date().toISOString();

        let updatedList: CartaTransferencia[];
        const letterToSave = {
            ...letter,
            bodyHtml: sanitizeRichHtml(letter.bodyHtml),
            updatedAt: now,
            createdAt: letter.createdAt || now
        };

        if (existingIdx >= 0) {
            updatedList = [...letters];
            updatedList[existingIdx] = letterToSave;
        } else {
            updatedList = [letterToSave, ...letters];
        }

        try {
            const serialized = JSON.stringify(updatedList);
            setScopedLocalStorageItem(STORAGE_KEY, serialized);
            localStorage.setItem(STORAGE_KEY, serialized);
        } catch (e) {
            console.error('Erro ao salvar carta de transferência:', e);
        }

        return letterToSave;
    }

    static deleteLetter(id: string): void {
        const letters = this.getLetters().filter(l => l.id !== id);
        try {
            const serialized = JSON.stringify(letters);
            setScopedLocalStorageItem(STORAGE_KEY, serialized);
            localStorage.setItem(STORAGE_KEY, serialized);
        } catch (e) {
            console.error('Erro ao excluir carta de transferência:', e);
        }
    }

    /**
     * Retorna o banco do cliente de forma inteligente:
     * 1. Das coordenadas bancárias cadastradas
     * 2. Detectado automaticamente pelo código do IBAN
     * 3. Ou valor padrão
     */
    static resolveClientBank(client?: Client | null): string {
        if (!client) return 'Banco de Domicílio Bancário';
        
        if (client.bankCoordinates && client.bankCoordinates.length > 0) {
            if (client.bankCoordinates[0].bankName && client.bankCoordinates[0].bankName.trim() !== '') {
                return client.bankCoordinates[0].bankName;
            }
            if (client.bankCoordinates[0].iban) {
                const identified = identifyBankFromIBAN(client.bankCoordinates[0].iban);
                if (identified) return identified.name;
            }
        }
        
        if ((client as any).bankName) {
            return (client as any).bankName;
        }
        
        const possibleIban = (client as any).iban;
        if (possibleIban) {
            const identified = identifyBankFromIBAN(possibleIban);
            if (identified) return identified.name;
        }

        return 'Banco de Domicílio Bancário';
    }

    /**
     * Retorna o IBAN do cliente
     */
    static resolveClientIBAN(client?: Client | null): string {
        if (!client) return 'AO06.0000.0000.0000.0000.0000.0';
        if (client.bankCoordinates && client.bankCoordinates.length > 0 && client.bankCoordinates[0].iban) {
            return client.bankCoordinates[0].iban;
        }
        return (client as any).iban || 'AO06.0000.0000.0000.0000.0000.0';
    }

    /**
     * Modelos de cartas pré-definidos no sistema
     */
    static getDefaultTemplates(): ModeloCarta[] {
        return [
            {
                id: 'modelo_ordem_permanente',
                name: 'Ordem de Transferência Bancária Permanente (Padrão)',
                description: 'Instrução formal de débitos mensais consecutivos para amortização de crédito.',
                subject: 'ASSUNTO: ORDEM DE TRANSFERÊNCIA BANCÁRIA PERMANENTE',
                isDefault: true,
                bodyHtmlTemplate: '' // Gerado dinamicamente
            },
            {
                id: 'modelo_domiciliacao_salario',
                name: 'Declaração de Domiciliação de Salário e Débito Automático',
                description: 'Instrução de retenção na fonte ou débito na data de crédito do vencimento/salário.',
                subject: 'ASSUNTO: DOMICILIAÇÃO DE SALÁRIO E AUTORIZAÇÃO DE DÉBITO EM CONTA',
                isDefault: true,
                bodyHtmlTemplate: ''
            },
            {
                id: 'modelo_liquidacao_antecipada',
                name: 'Carta de Amortização Extraordinária / Liquidação Total',
                description: 'Instrução bancária para liquidação integral ou abate de montante em dívida.',
                subject: 'ASSUNTO: SOLICITAÇÃO DE LIQUIDAÇÃO EXTRAORDINÁRIA DE CRÉDITO',
                isDefault: true,
                bodyHtmlTemplate: ''
            },
            {
                id: 'modelo_revogacao_ordem',
                name: 'Carta de Cancelamento / Revogação de Ordem Permanente',
                description: 'Comunicação bancária de término do contrato e cessação de débitos.',
                subject: 'ASSUNTO: REVOGAÇÃO DE ORDEM DE TRANSFERÊNCIA BANCÁRIA PERMANENTE',
                isDefault: true,
                bodyHtmlTemplate: ''
            }
        ];
    }

    /**
     * Carrega todos os modelos (padrões + personalizados do utilizador)
     */
    static getTemplates(): ModeloCarta[] {
        const defaults = this.getDefaultTemplates();
        try {
            const raw = getScopedLocalStorageItem(TEMPLATES_STORAGE_KEY) || localStorage.getItem(TEMPLATES_STORAGE_KEY);
            if (!raw) return defaults;
            const custom: ModeloCarta[] = JSON.parse(raw).map((model: ModeloCarta) => ({
                ...model,
                bodyHtmlTemplate: sanitizeRichHtml(model.bodyHtmlTemplate)
            }));
            return [...defaults, ...custom];
        } catch {
            return defaults;
        }
    }

    /**
     * Salva um modelo personalizado de carta
     */
    static saveCustomTemplate(modelo: ModeloCarta): ModeloCarta {
        const safeModel = { ...modelo, bodyHtmlTemplate: sanitizeRichHtml(modelo.bodyHtmlTemplate) };
        try {
            const raw = getScopedLocalStorageItem(TEMPLATES_STORAGE_KEY) || localStorage.getItem(TEMPLATES_STORAGE_KEY);
            const custom: ModeloCarta[] = raw ? JSON.parse(raw) : [];
            const idx = custom.findIndex(m => m.id === safeModel.id);
            if (idx >= 0) {
                custom[idx] = safeModel;
            } else {
                custom.push(safeModel);
            }
            const serialized = JSON.stringify(custom);
            setScopedLocalStorageItem(TEMPLATES_STORAGE_KEY, serialized);
            localStorage.setItem(TEMPLATES_STORAGE_KEY, serialized);
        } catch (e) {
            console.error('Erro ao salvar modelo de carta:', e);
        }
        return safeModel;
    }

    /**
     * Exclui um modelo personalizado
     */
    static deleteCustomTemplate(id: string): void {
        try {
            const raw = getScopedLocalStorageItem(TEMPLATES_STORAGE_KEY) || localStorage.getItem(TEMPLATES_STORAGE_KEY);
            if (!raw) return;
            const custom: ModeloCarta[] = JSON.parse(raw).filter((m: ModeloCarta) => m.id !== id);
            const serialized = JSON.stringify(custom);
            setScopedLocalStorageItem(TEMPLATES_STORAGE_KEY, serialized);
            localStorage.setItem(TEMPLATES_STORAGE_KEY, serialized);
        } catch (e) {
            console.error('Erro ao excluir modelo de carta:', e);
        }
    }

    /**
     * Gera o corpo padrão da carta formal com os dados do cliente e da empresa.
     * Inclui assinaturas de AMBAS AS PARTES e o quadro bancário.
     */
    static getDefaultLetterTemplate(
        client?: Client | null,
        credit?: Credit | null,
        companySettings?: any,
        templateId: string = 'modelo_ordem_permanente'
    ): {
        bankDestinationName: string;
        destinationBranch: string;
        subject: string;
        installmentAmount: number;
        dayOfMonth: number;
        bodyHtml: string;
    } {
        const currency = companySettings?.currency || 'Kz';
        const companyName = companySettings?.name || 'Tango Créditos, Lda.';
        const companyNif = companySettings?.nif || 'Não informado';
        const companyIban = (companySettings as any)?.bankDetails?.iban || (companySettings as any)?.iban || 'AO06.0000.0000.0000.0000.0000.0';
        const companyBank = (companySettings as any)?.bankDetails?.bankName || 'Banco Comercial';

        const clientName = client?.name || 'Nome do Cliente';
        const clientNif = client?.nif || 'BI/NIF Não informado';
        const clientIban = this.resolveClientIBAN(client);
        const clientBank = this.resolveClientBank(client);

        const installment = (credit as any)?.installmentAmount || (credit ? Math.round(credit.totalDue / (credit.installments || 1)) : 50000);
        const dayOfMonth = 28;

        let subject = 'ASSUNTO: ORDEM DE TRANSFERÊNCIA BANCÁRIA PERMANENTE';
        let introText = `Eu, <strong><mark class="bg-yellow-200">${clientName}</mark></strong>, portador(a) do Bilhete de Identidade / NIF n.º <strong>${clientNif}</strong>, titular da conta bancária domiciliada nessa prestigiada instituição financeira com o IBAN n.º <strong><mark class="bg-yellow-200">${clientIban}</mark></strong>, venho por meio desta, em conformidade com as normas bancárias vigentes, solicitar a constituição e execução de uma <strong>ORDEM DE TRANSFERÊNCIA BANCÁRIA PERMANENTE</strong> com as seguintes condições e termos de referência:`;

        if (templateId === 'modelo_domiciliacao_salario') {
            subject = 'ASSUNTO: DOMICILIAÇÃO DE SALÁRIO E AUTORIZAÇÃO DE DÉBITO EM CONTA';
            introText = `Eu, <strong><mark class="bg-yellow-200">${clientName}</mark></strong>, portador(a) do Bilhete de Identidade / NIF n.º <strong>${clientNif}</strong>, com conta-salário domiciliada nessa prestigiada instituição financeira com o IBAN n.º <strong><mark class="bg-yellow-200">${clientIban}</mark></strong>, venho declarar a formal <strong>DOMICILIAÇÃO DO MEU RENDIMENTO / SALÁRIO</strong> e autorizar expressamente a execução de débito automático mensal a favor da entidade credora sob as seguintes condições:`;
        } else if (templateId === 'modelo_liquidacao_antecipada') {
            subject = 'ASSUNTO: SOLICITAÇÃO DE LIQUIDAÇÃO EXTRAORDINÁRIA DE CRÉDITO';
            introText = `Eu, <strong><mark class="bg-yellow-200">${clientName}</mark></strong>, portador(a) do Bilhete de Identidade / NIF n.º <strong>${clientNif}</strong>, titular da conta bancária com o IBAN n.º <strong><mark class="bg-yellow-200">${clientIban}</mark></strong>, venho por este meio solicitar a realização de uma <strong>TRANSFERÊNCIA PONTUAL / LIQUIDAÇÃO ANTECIPADA</strong> com débito imediato em conta para amortização do crédito em epígrafe:`;
        } else if (templateId === 'modelo_revogacao_ordem') {
            subject = 'ASSUNTO: REVOGAÇÃO DE ORDEM DE TRANSFERÊNCIA BANCÁRIA PERMANENTE';
            introText = `Eu, <strong><mark class="bg-yellow-200">${clientName}</mark></strong>, portador(a) do Bilhete de Identidade / NIF n.º <strong>${clientNif}</strong>, titular da conta com o IBAN n.º <strong><mark class="bg-yellow-200">${clientIban}</mark></strong>, venho por este meio, em virtude da liquidação integral das obrigações contratuais assumidas, solicitar a formal <strong>CESSAÇÃO E REVOGAÇÃO</strong> da ordem de transferência permanente anteriormente constituída:`;
        }

        const bodyHtml = `
<p><strong>Ao</strong></p>
<p><strong>Exmo.(a) Senhor(a) Gerente do ${clientBank}</strong></p>
<p>Balcão / Agência: <u>Sede / Domicílio do Cliente</u></p>
<br/>

<p><strong>${subject}</strong></p>
<br/>

<p>${introText}</p>
<br/>

<table style="width: 100%; border-collapse: collapse; margin: 12px 0;">
    <tr style="background-color: #f1f5f9;">
        <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold; width: 40%;">Beneficiário:</td>
        <td style="padding: 8px; border: 1px solid #cbd5e1;"><strong>${companyName}</strong> (NIF: ${companyNif})</td>
    </tr>
    <tr>
        <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">Banco de Destino:</td>
        <td style="padding: 8px; border: 1px solid #cbd5e1;">${companyBank}</td>
    </tr>
    <tr style="background-color: #f1f5f9;">
        <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">IBAN de Crédito (Destino):</td>
        <td style="padding: 8px; border: 1px solid #cbd5e1;"><strong>${companyIban}</strong></td>
    </tr>
    <tr>
        <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">Montante por Transferência:</td>
        <td style="padding: 8px; border: 1px solid #cbd5e1;"><strong style="color: #047857;"><mark class="bg-green-100">${formatCurrency(installment, currency)}</mark></strong></td>
    </tr>
    <tr style="background-color: #f1f5f9;">
        <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">Periodicidade:</td>
        <td style="padding: 8px; border: 1px solid #cbd5e1;">Mensal e Consecutiva</td>
    </tr>
    <tr>
        <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">Dia de Débito em Conta:</td>
        <td style="padding: 8px; border: 1px solid #cbd5e1;"><strong>Dia ${dayOfMonth} de cada mês</strong> (ou dia útil imediatamente subsequente)</td>
    </tr>
    <tr style="background-color: #f1f5f9;">
        <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">Finalidade / Referência:</td>
        <td style="padding: 8px; border: 1px solid #cbd5e1;">Amortização de Prestação de Crédito - Ref. ${credit?.id || 'Ref. Contrato'}</td>
    </tr>
</table>
<br/>

<p>Mais se declara que esta ordem é de execução irrevogável sem o prévio consentimento formal da entidade credora acima identificada, ficando a instituição bancária autorizada a debitar da minha conta o montante estipulado e as despesas bancárias regulamentares aplicáveis.</p>
<br/>

<p>Agradecendo antecipadamente a atenção dispensada e os vossos préstimos habituais,</p>
<br/>

<p>Subscrevo-me com a mais distinta consideração,</p>
<br/>

<!-- BLOCO DE ASSINATURA DE AMBAS AS PARTES -->
<table style="width: 100%; margin-top: 35px; border: none; text-align: center;">
    <tr>
        <td style="width: 50%; vertical-align: top; padding: 0 15px;">
            <p style="margin-bottom: 6px; color: #334155;">_________________________________________</p>
            <p style="margin: 0; font-weight: bold; font-size: 11px;">${clientName}</p>
            <p style="margin: 2px 0 0 0; font-size: 9.5px; color: #475569;"><strong>O(A) Titular da Conta / Cliente</strong></p>
            <p style="margin: 0; font-size: 8.5px; color: #64748b;">(Assinatura conforme BI / Ficha de Abertura)</p>
        </td>
        <td style="width: 50%; vertical-align: top; padding: 0 15px;">
            <p style="margin-bottom: 6px; color: #334155;">_________________________________________</p>
            <p style="margin: 0; font-weight: bold; font-size: 11px;">Pela Entidade Credora</p>
            <p style="margin: 2px 0 0 0; font-size: 9.5px; color: #475569;"><strong>${companyName}</strong></p>
            <p style="margin: 0; font-size: 8.5px; color: #64748b;">(Assinatura Autorizada e Carimbo)</p>
        </td>
    </tr>
</table>

<!-- QUADRO RESERVADO AO BANCO DOMICILIÁRIO -->
<table style="width: 100%; border: 1px dashed #94a3b8; padding: 10px; margin-top: 25px; background-color: #f8fafc; border-radius: 4px;">
    <tr>
        <td style="font-size: 9.5px; color: #334155; line-height: 1.6;">
            <strong style="color: #0f172a; text-transform: uppercase;">RESERVADO AO BANCO DOMICILIÁRIO:</strong><br/>
            Rececionado por: _____________________________________ &nbsp;&nbsp;&nbsp;&nbsp; Data: _____ / _____ / 202___<br/>
            Carimbo e Validação do Balcão:
        </td>
    </tr>
</table>
        `.trim();

        return {
            bankDestinationName: clientBank,
            destinationBranch: 'Balcão Central',
            subject,
            installmentAmount: installment,
            dayOfMonth,
            bodyHtml
        };
    }
}
