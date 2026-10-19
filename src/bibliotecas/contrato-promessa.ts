// Modelo do contrato de mútuo e financiamento de microcrédito (o "Contrato-Promessa" da página Contratos).
// O texto é editável: os campos {{...}} são substituídos pelos dados da empresa, do cliente e do crédito.

import { buildPaymentPlan } from './plano-pagamento.ts';
import { kwanzasPorExtenso } from './extenso.ts';
import { formatCurrency, formatDate } from './formatters.ts';

export const PROMESSA_CONTRACT_TITLE = 'CONTRATO DE MÚTUO E FINANCIAMENTO DE MICROCRÉDITO';

const VAZIO = '________________';

/** Campos próprios deste modelo (além dos campos comuns dos contratos). */
export const PROMESSA_PLACEHOLDERS: Array<{ token: string; label: string }> = [
    { token: '{{EMPRESA_CURTO}}', label: 'Nome abreviado da empresa' },
    { token: '{{CIDADE_EMPRESA}}', label: 'Cidade / província da empresa' },
    { token: '{{ESTADO_CIVIL}}', label: 'Estado civil do cliente' },
    { token: '{{BI_CLIENTE}}', label: 'N.º do B.I. / documento do cliente' },
    { token: '{{MORADA_CLIENTE}}', label: 'Morada do cliente' },
    { token: '{{TELEFONE_CLIENTE}}', label: 'Telefone do cliente' },
    { token: '{{EMAIL_CLIENTE}}', label: 'Email do cliente' },
    { token: '{{VALOR_EXTENSO}}', label: 'Capital por extenso' },
    { token: '{{PRAZO_MESES}}', label: 'Prazo em meses' },
    { token: '{{TAXA_MENSAL}}', label: 'Taxa de juro mensal' },
    { token: '{{JUROS}}', label: 'Montante de juros' },
    { token: '{{JUROS_EXTENSO}}', label: 'Juros por extenso' },
    { token: '{{TOTAL}}', label: 'Total a pagar (capital + juros)' },
    { token: '{{TOTAL_EXTENSO}}', label: 'Total por extenso' },
    { token: '{{PRESTACAO}}', label: 'Valor de cada prestação' },
    { token: '{{PRESTACAO_EXTENSO}}', label: 'Prestação por extenso' },
    { token: '{{DIA_VENCIMENTO}}', label: 'Dia de vencimento mensal' },
    { token: '{{PRIMEIRA_PRESTACAO}}', label: 'Data da 1.ª prestação' },
    { token: '{{DATA_FIM_PLANO}}', label: 'Data da última prestação' },
    { token: '{{TAXA_MORA}}', label: 'Taxa de mora diária' },
    { token: '{{DATA_CONTRATO}}', label: 'Data do contrato' },
];

const percent = (value: number) => `${Number(value.toFixed(2)).toLocaleString('pt-PT', { maximumFractionDigits: 2 })}%`;

/** Cidade/província da empresa: a localização das Definições ou, se for só o país, o início da morada. */
export const companyCity = (config: { location?: string; address?: string }) => {
    const location = String(config.location || '').trim();
    if (location && !/^angola$/i.test(location)) return location.split(/\s+-\s+|,/)[0].trim();
    const address = String(config.address || '').split(',')[0].trim();
    return address || 'Luanda';
};

/** Nome curto da empresa: a parte antes de " - ", " – " ou da primeira vírgula ("BRAVALDO"). */
export const companyShortName = (name: string) => String(name || '').split(/\s+[-–]\s+|,/)[0].trim() || String(name || '');

/** Valores dos campos deste modelo, calculados a partir do crédito (método FLAT, como o plano de pagamento). */
export const promessaPlaceholderValues = (contract: any, config: { name?: string; location?: string; address?: string; currency?: string }): Record<string, string> => {
    const currency = config.currency || 'AOA';
    const principal = Number(contract?.principalAmount ?? contract?.value ?? 0) || 0;
    const months = Math.max(1, Math.round(Number(contract?.installments) || 1));
    const rate = Math.max(0, Number(contract?.interestRate) || 0);
    const startDate = contract?.startDate ? new Date(contract.startDate) : new Date();
    let interest = principal * rate / 100;
    let installment = (principal + interest) / months;
    let firstDue: string | null = null;
    let lastDue: string | null = null;
    try {
        const plan = buildPaymentPlan({ principalMinor: Math.round(principal * 100), ratePercent: rate, months, startDate });
        interest = plan.interestMinor / 100;
        installment = plan.installmentMinor / 100;
        firstDue = plan.firstDueDate;
        lastDue = plan.lastDueDate;
    } catch {
        // Crédito incompleto (sem capital ou prazo): ficam os valores aproximados acima.
    }
    const total = principal + interest;
    const lateRate = Number(contract?.lateInterestRate);
    const text = (value: any) => String(value ?? '').trim() || VAZIO;
    return {
        '{{EMPRESA_CURTO}}': companyShortName(config.name || '') || VAZIO,
        '{{CIDADE_EMPRESA}}': companyCity(config),
        '{{ESTADO_CIVIL}}': text(contract?.clientMaritalStatus),
        '{{BI_CLIENTE}}': text(contract?.clientDocumentNumber),
        '{{MORADA_CLIENTE}}': text(contract?.clientAddress),
        '{{TELEFONE_CLIENTE}}': text(contract?.clientPhone),
        '{{EMAIL_CLIENTE}}': text(contract?.clientEmail),
        '{{VALOR_EXTENSO}}': kwanzasPorExtenso(principal),
        '{{PRAZO_MESES}}': String(months),
        '{{TAXA_MENSAL}}': percent(rate / months),
        '{{JUROS}}': formatCurrency(interest, currency),
        '{{JUROS_EXTENSO}}': kwanzasPorExtenso(interest),
        '{{TOTAL}}': formatCurrency(total, currency),
        '{{TOTAL_EXTENSO}}': kwanzasPorExtenso(total),
        '{{PRESTACAO}}': formatCurrency(installment, currency),
        '{{PRESTACAO_EXTENSO}}': kwanzasPorExtenso(installment),
        '{{DIA_VENCIMENTO}}': firstDue ? formatDate(firstDue).slice(0, 2) : VAZIO,
        '{{PRIMEIRA_PRESTACAO}}': firstDue ? formatDate(firstDue) : VAZIO,
        '{{DATA_FIM_PLANO}}': lastDue ? formatDate(lastDue) : VAZIO,
        '{{TAXA_MORA}}': Number.isFinite(lateRate) && lateRate > 0 ? percent(lateRate) : '1%',
        '{{DATA_CONTRATO}}': formatDate(startDate),
    };
};

/** Texto padrão do contrato (partes, cláusulas e fecho). Linhas "CLÁUSULA..." e títulos terminados em ":" saem a negrito. */
export const PROMESSA_CLAUSES_TEMPLATE = `Entre as partes abaixo assinadas, a saber:

CREDORA / SOCIEDADE MUTUANTE:
{{EMPRESA}}, com sede e estabelecimento comercial em {{CIDADE_EMPRESA}}, Angola, inscrita junto das autoridades financeiras competentes sob o NIF {{NIF_EMPRESA}}, adiante designada abreviadamente apenas por Credora ou {{EMPRESA_CURTO}}.

MUTUÁRIO / BENEFICIÁRIO:
O(A) Sr.(a) {{CLIENTE}}, estado civil: {{ESTADO_CIVIL}}, portador(a) do B.I. N.º {{BI_CLIENTE}}, com o NIF N.º {{NIF_CLIENTE}}, residente e domiciliado(a) no endereço: {{MORADA_CLIENTE}}, contacto: {{TELEFONE_CLIENTE}}, email: {{EMAIL_CLIENTE}}, adiante designado(a) por Mutuário.

Ambas as partes celebram livremente o presente Contrato de Mútuo sob a égide da legislação angolana vigente e de acordo com as seguintes cláusulas:

CLÁUSULA 1.ª (OBJECTO DO CONTRATO)
A {{EMPRESA_CURTO}} concede ao Mutuário, {{CLIENTE}}, um financiamento no montante de {{VALOR}} (por extenso: {{VALOR_EXTENSO}}), destinado exclusivamente ao desenvolvimento de actividade económica geradora de rendimento.

CLÁUSULA 2.ª (MONTANTE E DESEMBOLSO)
1. O valor total do empréstimo de {{VALOR}} será disponibilizado ao Mutuário mediante transferência bancária para a conta referenciada, cheque ou entrega directa em mãos.
2. A assinatura do presente contrato, bem como o comprovante bancário associado, constitui prova bastante e suficiente de recebimento integral e irrevogável do valor financiado.

CLÁUSULA 3.ª (PRAZO)
O empréstimo é concedido pelo prazo de {{PRAZO_MESES}} meses, com início na data de assinatura em {{DATA_CONTRATO}} e vencimento final irrevogável em {{DATA_FIM_PLANO}}.

CLÁUSULA 4.ª (TAXA DE JURO)
1. A taxa de juro contratada e aprovada pelo conselho de crédito é de {{TAXA_MENSAL}} ao mês (totalizando {{TAXA}} sobre o financiamento durante todo o período de {{PRAZO_MESES}} meses).
2. Isto corresponde a um montante de juros de {{JUROS}} (por extenso: {{JUROS_EXTENSO}}), resultando num custo financeiro globalizado a pagar pelo Mutuário (Capital + Juros) de {{TOTAL}} (por extenso: {{TOTAL_EXTENSO}}).
3. O Mutuário declara para os devidos fins de direito ter recebido informação clara e transparente sobre o custo financeiro total, incluindo taxas e todos os encargos inerentes à operação.

CLÁUSULA 5.ª (PLANO DE REEMBOLSO)
1. O reembolso do capital acrescido de juros incidentes será efectuado em {{PRESTACOES}} prestações mensais e consecutivas, no valor regular de {{PRESTACAO}} cada (por extenso: {{PRESTACAO_EXTENSO}} por prestação).
2. As prestações vencer-se-ão estritamente no dia {{DIA_VENCIMENTO}} de cada mês subsequente, iniciando com a primeira quota de amortização devida em {{PRIMEIRA_PRESTACAO}} e terminando em {{DATA_FIM_PLANO}}.
3. As parcelas deverão ser quitadas pelo Mutuário mediante depósito em conta oficial, transferência electrónica interbancária ou qualquer outra modalidade física validamente aceite e devidamente comprovada em caixa pela Credora.

CLÁUSULA 6.ª (DIREITO À INFORMAÇÃO)
A {{EMPRESA_CURTO}} compromete-se a fornecer ao Mutuário durante toda a vigência regulamentar do acordo:
• a) Informação clara, transparente e atempada sobre taxas de juros, encargos e saldos em falta;
• b) Historial e cronograma actualizado de pagamentos;
• c) Posição e extracto do saldo global da dívida sempre que solicitado pelo cliente;
• d) Os respectivos comprovativos/recibos de quitação impressos sobre cada recebimento.

CLÁUSULA 7.ª (OBRIGAÇÕES DO MUTUÁRIO)
O Mutuário obriga-se em consciência a:
• a) Utilizar os recursos do capital financiados exclusivamente na finalidade mercantil e de fomento produtivo aqui declarada;
• b) Fornecer e manter actualizadas informações fidedignas e completas ao assistente comercial;
• c) Comunicar imediatamente por escrito alterações no endereço residencial, telefones ou sede de actividade económica;
• d) Permitir visitas de acompanhamento técnico e fiscalização comercial pelo agente credenciado;
• e) Cumprir de forma escrupulosamente pontual o pagamento das prestações mensais acordadas.

CLÁUSULA 8.ª (GARANTIAS)
1. Em salvaguarda ao cumprimento do mútuo, o presente contrato poderá ser garantido por:
• Avalista idóneo solidário em folha de registo comercial;
• Garantia solidária em grupo de crédito de fomento;
• Equipamentos mercantis, bens móveis, ou veículos sujeitos a penhor mercantil;
• Equipamento/mercadoria financiada sob cláusula de reserva de propriedade;
• Outras garantias acessórias legalmente admissíveis sob contrato acessório ou assinalado em anexo.
2. O avalista subscritor responde pessoal, solidária e integralmente por todas as obrigações e montantes assumidos pelo Mutuário titular.

CLÁUSULA 9.ª (FISCALIZAÇÃO E ACOMPANHAMENTO)
1. A {{EMPRESA_CURTO}} reserva-se o pleno direito de efectuar visitas de monitorização e acompanhamento periódico ao negócio ou localidade financiada, visando constatar a viabilidade económica.
2. O Mutuário assume o dever de cooperar activamente, provendo os esclarecimentos e elementos requeridos pela fiscalização.

CLÁUSULA 10.ª (MORA)
1. O não pagamento pontual de qualquer parcela mensal amortizável na respectiva data de vencimento constitui o Mutuário em mora, independentemente de interpelação.
2. Verificada a mora, incidirão sobre as somas vencidas juros moratórios adicionais na taxa de {{TAXA_MORA}} ao dia até à respectiva regularização.

CLÁUSULA 11.ª (VENCIMENTO ANTECIPADO)
A totalidade da dívida em plano de amortização vencer-se-á e tornar-se-á imediatamente líquida e judicialmente exigível caso ocorra:
• a) O incumprimento total ou parcial de 2 (duas) prestações consecutivas de pagamento;
• b) Apresentação de documentos fraudulentos ou declaração de informações falsas;
• c) Desvio comprovado dos fundos entregues para finalidades diferentes das descritas em análise de projecto;
• d) Dissolução, extinção mercantil, interrupção ou encerramento da actividade económica financiada.

CLÁUSULA 12.ª (LIQUIDAÇÃO ANTECIPADA)
1. O Mutuário dispõe da faculdade de liquidar antecipadamente, de forma parcial ou integral, a dívida corrente.
2. Nesse cenário, os juros serão ajustados de forma proporcional e computados estritamente na base dos dias decorridos até à entrega efectiva do valor de quitação.

CLÁUSULA 13.ª (PROTECÇÃO E CONFIDENCIALIDADE DOS DADOS)
1. Todas as informações cadastrais e comerciais fornecidas serão tratadas sob rígida disciplina interna de TI e salvaguardadas exclusivamente para fins de análise creditícia e gestão administrativa.
2. A {{EMPRESA_CURTO}} assegura total privacidade e segredo bancário, ressalvando-se solicitações por ordem judicial legítima, regras estabelecidas pelo BNA ou em virtude da legislação em vigor.

CLÁUSULA 14.ª (PREVENÇÃO DE FRAUDE E BRANQUEAMENTO DE CAPITAIS)
O Mutuário atesta em honra que toda a documentação cadastral entregue é autêntica e legítima e assevera que os recursos resultantes do mútuo destinam-se a transacções e actividades lícitas.

CLÁUSULA 15.ª (RESOLUÇÃO DE LITÍGIOS)
1. Em face de quaisquer diferendos ou litígios, as partes envidarão esforços prévios de cariz amigável e extrajudicial.
2. Não logrando sucesso consensual, declara-se competente o foro judicial da Comarca de {{CIDADE_EMPRESA}}.

CLÁUSULA 16.ª (DISPOSIÇÕES FINAIS)
1. O presente título é provido de força executiva bastante sob termos de lei civil.
2. O Mutuário lê em harmonia, compreende e confere aceitação expressa e irreversível a todos os preceitos descritos.
3. O acordo é emitido em {{CIDADE_EMPRESA}} – Angola, em duas vias de igual teor e idêntico valor de lei.`;
