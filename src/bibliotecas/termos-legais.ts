// Termos de utilização, políticas e enquadramento legal (Angola). Um único texto alimenta a página
// "Termos e Políticas" e a última página da Ficha de Simulação, para que digam sempre o mesmo.
// Diplomas do BNA confirmados em www.bna.ao (Legislação e Normas); os restantes vêm do Diário da República.

import { formatDecimal } from './formatters';
import type { StampDutyRates } from './simulador-credito';

export const TERMS_VERSION = '1.0';
export const TERMS_UPDATED_AT = '5 de Outubro de 2026';
export const LEGAL_SOURCE_NOTE = 'Diplomas do Banco Nacional de Angola consultados em www.bna.ao (Legislação e Normas) em Outubro de 2026; os restantes diplomas citam-se pela publicação no Diário da República.';
export const LEGAL_DISCLAIMER = 'Este texto resume, em linguagem simples, as regras aplicáveis e a forma como o sistema as aplica. Não substitui a leitura dos diplomas oficiais nem o parecer de um jurista, e deve ser revisto sempre que a legislação mudar.';
export const SIMULATION_NOTICE = 'Simulação de carácter informativo, não vinculativa. Sujeita a aprovação.';

export type LegalContext = {
    companyName: string;
    nif?: string;
    address?: string;
    location?: string;
    phone?: string;
    email?: string;
    validityDays: number;
    effortLimit: number;
    lateSurcharge: number;
    stampDuty: StampDutyRates;
    indexName: string;
};

export type LegalReference = {
    id: string;
    /** Diploma, número e data. */
    diploma: string;
    /** Assunto oficial. */
    subject: string;
    /** O que o sistema aplica deste diploma. */
    application: string;
    source: 'BNA' | 'Diário da República';
};

export type LegalArticle = { number: number; title: string; paragraphs: string[]; references?: string[] };

export const LEGAL_REFERENCES: LegalReference[] = [
    { id: 'lei-14-21', diploma: 'Lei n.º 14/21, de 19 de Maio', subject: 'Lei do Regime Geral das Instituições Financeiras', application: 'Enquadramento da actividade de concessão de crédito, dever de segredo e supervisão pelo BNA.', source: 'BNA' },
    { id: 'lei-24-21', diploma: 'Lei n.º 24/21, de 18 de Outubro', subject: 'Lei do Banco Nacional de Angola', application: 'Competência do BNA para regular, emitir Avisos e Instrutivos e receber reclamações dos clientes.', source: 'BNA' },
    { id: 'aviso-12-2016', diploma: 'Aviso n.º 12/2016, de 5 de Setembro', subject: 'Protecção dos Consumidores de Produtos e Serviços Financeiros', application: 'Informação ao cliente (art. 7.º), dados pessoais (art. 10.º), segredo (art. 11.º), recolha de informação (art. 13.º), segurança (art. 14.º) e reclamações (arts. 19.º, 23.º e 24.º).', source: 'BNA' },
    { id: 'aviso-15-2020', diploma: 'Aviso n.º 15/2020, de 22 de Junho', subject: 'Preçário de Serviços e Produtos Financeiros e Sua Divulgação', application: 'Definições de TAEG, taxa de juro fixa e variável e dia útil (art. 3.º), preçário (art. 4.º) e dever de informação (art. 9.º).', source: 'BNA' },
    { id: 'instrutivo-12-2020', diploma: 'Instrutivo n.º 12/2020, de 6 de Julho', subject: 'Sistema Financeiro — Preçário', application: 'Divulgação das comissões, despesas e taxas de juro aplicadas aos produtos de crédito.', source: 'BNA' },
    { id: 'instrutivo-07-2020', diploma: 'Instrutivo n.º 07/2020, de 20 de Abril', subject: 'Sistema Financeiro — Concessão de Crédito', application: 'Análise da capacidade de pagamento antes da concessão (taxa de esforço e risco do cliente).', source: 'BNA' },
    { id: 'aviso-01-2021', diploma: 'Aviso n.º 01/2021, de 12 de Fevereiro, e Instrutivo n.º 05/2021, de 26 de Fevereiro', subject: 'Central de Informação de Risco de Crédito (CIRC)', application: 'Comunicação das responsabilidades de crédito e consulta do historial do cliente.', source: 'BNA' },
    { id: 'dp-89-23', diploma: 'Decreto Presidencial n.º 89/23, de 31 de Março', subject: 'Regulamento das Sociedades de Microcrédito e Operadores de Microcrédito', application: 'Regime aplicável às entidades que concedem microcrédito.', source: 'BNA' },
    { id: 'aviso-04-2023', diploma: 'Aviso n.º 04/2023, de 28 de Junho', subject: 'Constituição e funcionamento das Sociedades de Microcrédito e Cooperativas de Crédito', application: 'Registo especial no BNA antes do início da actividade (art. 8.º).', source: 'BNA' },
    { id: 'lei-22-11', diploma: 'Lei n.º 22/11, de 17 de Junho', subject: 'Lei da Protecção de Dados Pessoais', application: 'Tratamento dos dados dos clientes apenas para as finalidades declaradas, com segurança e direitos de acesso e rectificação.', source: 'Diário da República' },
    { id: 'lei-15-03', diploma: 'Lei n.º 15/03, de 22 de Julho', subject: 'Lei de Defesa do Consumidor', application: 'Direito à informação clara, completa e em língua portuguesa sobre o preço e as condições do crédito.', source: 'Diário da República' },
    { id: 'lei-05-20', diploma: 'Lei n.º 05/20, de 27 de Janeiro', subject: 'Prevenção e Combate ao Branqueamento de Capitais, do Financiamento do Terrorismo e da Proliferação de Armas de Destruição em Massa', application: 'Identificação e diligência sobre o cliente («conheça o seu cliente») e conservação de registos.', source: 'Diário da República' },
    { id: 'cis', diploma: 'Código do Imposto do Selo — Tabela, verba 17', subject: 'Operações financeiras: utilização de crédito e juros', application: 'Imposto do Selo sobre a utilização do crédito (conforme o prazo) e sobre os juros de cada prestação.', source: 'Diário da República' },
    { id: 'codigo-civil', diploma: 'Código Civil — arts. 559.º, 804.º a 806.º e 1146.º', subject: 'Juros, mora do devedor e usura', application: 'Juros de mora sobre prestações vencidas e não pagas e limites aos juros convencionados.', source: 'Diário da República' },
];

const pct = (value: number, digits = 2) => `${formatDecimal(value, digits)}%`;

/** Contexto legal a partir dos dados da empresa e da configuração do simulador. */
export function legalContextFrom(
    settings: { name?: string; nif?: string; address?: string; location?: string; phone?: string; email?: string } | null | undefined,
    config: { validityDays: number; effortLimit: number; lateSurcharge: number; stampDuty: StampDutyRates; indexName: string },
): LegalContext {
    return {
        companyName: settings?.name?.trim() || 'A empresa',
        nif: settings?.nif || undefined,
        address: settings?.address || undefined,
        location: settings?.location || undefined,
        phone: settings?.phone || undefined,
        email: settings?.email || undefined,
        validityDays: config.validityDays,
        effortLimit: config.effortLimit,
        lateSurcharge: config.lateSurcharge,
        stampDuty: config.stampDuty,
        indexName: config.indexName,
    };
}

/** Identificação da empresa numa frase ("TANGO, Lda., NIF 500..., com sede em ..."). */
export function companyIdentity(ctx: LegalContext): string {
    const parts = [ctx.companyName || 'A empresa'];
    if (ctx.nif) parts.push(`NIF ${ctx.nif}`);
    const address = [ctx.address, ctx.location].filter(Boolean).join(', ');
    if (address) parts.push(`com sede em ${address}`);
    return parts.join(', ');
}

/** Como a simulação é calculada: texto da Ficha de Simulação e da página de Termos. */
export function simulationMethodology(ctx: LegalContext): Array<{ title: string; text: string }> {
    const s = ctx.stampDuty;
    return [
        { title: 'Prestações constantes', text: 'A prestação (juros + amortização) é igual em todo o plano: P = C × i / (1 − (1 + i)^−n), em que C é o capital, n o número de prestações e i a taxa mensal (TAN ÷ 12).' },
        { title: 'Amortizações constantes', text: 'O capital é reembolsado em partes iguais (C ÷ n); os juros incidem sobre o capital em dívida, pelo que a prestação diminui ao longo do plano.' },
        { title: 'Carência', text: 'Na carência de capital o cliente paga apenas os juros e encargos; na carência de capital e juros nada é pago e os juros são somados ao capital em dívida (capitalizados).' },
        { title: 'Arredondamentos', text: 'Todos os valores são calculados em cêntimos e arredondados a 2 casas decimais em cada linha. A diferença de arredondamento é acertada na última prestação, para o capital em dívida terminar em 0,00 Kz.' },
        { title: 'Datas de vencimento', text: 'As prestações vencem no dia escolhido de cada mês. Se esse dia for sábado, domingo, feriado nacional ou dia sem expediente configurado, o vencimento passa para o dia útil seguinte (definição de «dia útil» do art. 3.º do Aviso n.º 15/2020).' },
        { title: 'Imposto do Selo', text: `Sobre a utilização do crédito: ${pct(s.upToOneYear)} (prazo até 1 ano), ${pct(s.overOneYear)} (mais de 1 ano) ou ${pct(s.fiveYearsOrMore)} (5 anos ou mais), cobrado no desembolso; sobre os juros: ${pct(s.interest)} dos juros de cada prestação (Tabela do Imposto do Selo, verba 17).` },
        { title: 'TAN e taxa variável', text: `A TAN é a taxa anual nominal. Na taxa variável, TAN = indexante (${ctx.indexName}) + spread, revista quando o indexante muda; a simulação usa o valor do indexante na data em que é feita.` },
        { title: 'TAEG', text: 'A TAEG representa o custo total efectivo do crédito, incluindo juros, comissões, impostos e seguros (art. 3.º, al. n), do Aviso n.º 15/2020). É calculada pela taxa interna de rentabilidade dos fluxos reais — o montante efectivamente recebido e cada prestação total paga — e anualizada: TAEG = (1 + TIR mensal)^12 − 1.' },
        { title: 'MTIC', text: 'O Montante Total Imputado ao Cliente é a soma do capital, juros, comissões, impostos e seguros que o cliente suporta durante todo o contrato.' },
        { title: 'Taxa de esforço e risco', text: `Taxa de esforço = (nova prestação + outros encargos mensais com créditos) ÷ rendimento mensal líquido × 100. O limite da empresa é ${pct(ctx.effortLimit, 0)}. O nível de risco resulta da taxa de esforço, do histórico de pagamentos, dos créditos activos e das garantias, e ajusta a TAN conforme a tabela da empresa.` },
    ];
}

/** Artigos dos Termos de Utilização e Políticas, com o nome e os dados da empresa. */
export function buildTermsArticles(ctx: LegalContext): LegalArticle[] {
    const company = ctx.companyName || 'a empresa';
    const contacts = [ctx.phone && `telefone ${ctx.phone}`, ctx.email && `correio electrónico ${ctx.email}`].filter(Boolean).join(' ou ');
    const articles: Array<Omit<LegalArticle, 'number'>> = [
        {
            title: 'Objecto e âmbito',
            paragraphs: [
                `Os presentes Termos regulam a utilização do sistema de gestão de crédito de ${companyIdentity(ctx)} (doravante «${company}»), incluindo o simulador de crédito, a ficha de simulação, os pedidos de crédito, os contratos, os pagamentos e as comunicações com os clientes.`,
                `Aplicam-se aos utilizadores internos de ${company} e, na parte que lhes respeita, aos clientes e potenciais clientes cujos dados são tratados no sistema.`,
            ],
        },
        {
            title: 'Definições',
            paragraphs: [
                'Capital: montante pedido pelo cliente. Capital em dívida: parte do capital ainda por reembolsar. Prestação: valor pago em cada vencimento (juros, amortização de capital, impostos, comissões e seguros).',
                'TAN — Taxa Anual Nominal: taxa de juro anual aplicada ao capital em dívida. Taxa fixa: mantém-se durante o contrato. Taxa variável: acompanha um indexante (por exemplo, a LUIBOR) acrescido de um spread.',
                'TAEG — Taxa Anual de Encargos Efectiva Global: custo total efectivo do crédito, incluindo juros, comissões, impostos, taxas e seguros. MTIC — Montante Total Imputado ao Cliente.',
                'Taxa de esforço: percentagem do rendimento mensal líquido do cliente comprometida com prestações de crédito. Carência: período inicial sem amortização de capital. Dia útil: dia em que as instituições financeiras estão abertas ao público.',
            ],
            references: ['Aviso n.º 15/2020, art. 3.º'],
        },
        {
            title: 'Natureza das simulações',
            paragraphs: [
                `As simulações têm carácter meramente informativo e não são vinculativas: não constituem proposta contratual nem garantia de aprovação. A concessão do crédito depende da análise de risco, da documentação do cliente e da decisão de ${company}.`,
                `Cada ficha de simulação tem um número único e um código de verificação e é válida por ${ctx.validityDays} dias a contar da emissão; terminado esse prazo, as condições podem ser alteradas.`,
                'Antes de qualquer decisão, o cliente recebe por escrito o montante, o prazo, a TAN, a TAEG, as comissões, os impostos, os seguros, o MTIC e o plano completo de prestações.',
            ],
            references: ['Aviso n.º 12/2016, art. 7.º', 'Lei n.º 15/03'],
        },
        {
            title: 'Taxas de juro, comissões e preçário',
            paragraphs: [
                `As taxas de juro, comissões e despesas aplicadas por ${company} constam do seu preçário, que deve estar disponível ao público e ser comunicado ao Banco Nacional de Angola nos termos aplicáveis.`,
                'A comissão de abertura pode ser descontada no desembolso ou financiada (somada ao capital); a comissão de processamento é cobrada em cada prestação; o seguro, quando contratado, incide sobre o capital em dívida.',
                `Nos créditos com taxa variável, a TAN corresponde ao indexante (${ctx.indexName}) acrescido do spread acordado e é revista quando o indexante muda.`,
            ],
            references: ['Aviso n.º 15/2020, arts. 3.º, 4.º e 9.º', 'Instrutivo n.º 12/2020'],
        },
        {
            title: 'Imposto do Selo',
            paragraphs: [
                `A utilização do crédito está sujeita a Imposto do Selo de ${pct(ctx.stampDuty.upToOneYear)} (prazo até 1 ano), ${pct(ctx.stampDuty.overOneYear)} (prazo superior a 1 ano) ou ${pct(ctx.stampDuty.fiveYearsOrMore)} (prazo igual ou superior a 5 anos), e os juros de cada prestação a ${pct(ctx.stampDuty.interest)}.`,
                `O imposto é liquidado por ${company} e entregue ao Estado. As taxas são configuráveis no sistema e devem ser confirmadas junto da Administração Geral Tributária sempre que a Tabela for alterada.`,
            ],
            references: ['Código do Imposto do Selo, Tabela, verba 17'],
        },
        {
            title: 'Avaliação da capacidade de pagamento',
            paragraphs: [
                `Antes de conceder crédito, ${company} avalia a capacidade de pagamento do cliente com base no rendimento mensal líquido, nos encargos com outros créditos, no histórico de pagamentos e nas garantias apresentadas.`,
                `A taxa de esforço não deve exceder ${pct(ctx.effortLimit, 0)}. Acima deste limite, o sistema alerta o utilizador e indica o montante máximo recomendado e o prazo mínimo. A alteração manual do nível de risco exige justificação, que fica registada na auditoria.`,
                'Só são recolhidas as informações pessoais necessárias à oferta dos produtos, à avaliação da capacidade de pagamento e ao cumprimento do princípio «conheça o seu cliente».',
            ],
            references: ['Instrutivo n.º 07/2020', 'Aviso n.º 12/2016, art. 13.º'],
        },
        {
            title: 'Mora e incumprimento',
            paragraphs: [
                `Em caso de atraso no pagamento de uma prestação, são devidos juros de mora sobre o valor vencido e não pago, à taxa da TAN do contrato acrescida de uma sobretaxa de ${formatDecimal(ctx.lateSurcharge, 2)} pontos percentuais ao ano, desde o vencimento até ao pagamento.`,
                'O incumprimento pode determinar o vencimento antecipado das prestações, a execução das garantias e a comunicação da responsabilidade em incumprimento à Central de Informação de Risco de Crédito.',
                'Os juros convencionados não podem exceder os limites legais aplicáveis, sob pena de redução nos termos da lei civil.',
            ],
            references: ['Código Civil, arts. 559.º, 804.º a 806.º e 1146.º'],
        },
        {
            title: 'Protecção de dados pessoais',
            paragraphs: [
                `${company} é responsável pelo tratamento dos dados pessoais dos clientes registados no sistema e trata-os apenas para análise, concessão, gestão e cobrança de crédito, cumprimento de obrigações legais e comunicação com o cliente.`,
                'Os dados são guardados com controlo de acessos por utilizador, registo de auditoria e cópias de segurança. O titular pode pedir o acesso, a rectificação e, quando a lei o permita, a eliminação dos seus dados.',
                'Os dados não são cedidos a terceiros, salvo obrigação legal (por exemplo, BNA, CIRC, autoridades fiscais ou judiciais) ou consentimento do titular.',
            ],
            references: ['Lei n.º 22/11', 'Aviso n.º 12/2016, arts. 10.º e 14.º'],
        },
        {
            title: 'Dever de segredo',
            paragraphs: [
                `Os utilizadores do sistema e os trabalhadores de ${company} estão obrigados a segredo sobre os factos e informações relativos aos clientes de que tomem conhecimento no exercício das suas funções, mesmo depois de cessarem funções.`,
            ],
            references: ['Aviso n.º 12/2016, art. 11.º', 'Lei n.º 14/21'],
        },
        {
            title: 'Central de Informação de Risco de Crédito',
            paragraphs: [
                `Quando aplicável, ${company} consulta e comunica à Central de Informação de Risco de Crédito (CIRC) do BNA as responsabilidades de crédito dos clientes, nos termos e prazos fixados pelo Banco Nacional de Angola.`,
            ],
            references: ['Aviso n.º 01/2021', 'Instrutivo n.º 05/2021'],
        },
        {
            title: 'Prevenção do branqueamento de capitais',
            paragraphs: [
                `${company} identifica os seus clientes, verifica os documentos apresentados e conserva os registos das operações. Pode recusar ou suspender operações quando a identificação não seja possível ou existam indícios de branqueamento de capitais ou de financiamento do terrorismo.`,
            ],
            references: ['Lei n.º 05/20'],
        },
        {
            title: 'Reclamações',
            paragraphs: [
                `O cliente pode apresentar reclamações a ${company}${contacts ? ` através do ${contacts}` : ''}, presencialmente ou por escrito.`,
                'As reclamações são solucionadas no prazo de 20 dias a contar da recepção (30 dias quando envolvam mais do que uma instituição) e o resultado é comunicado por escrito, com o número de referência, a data de apresentação e a fundamentação.',
                'O cliente pode ainda reclamar junto do Banco Nacional de Angola.',
            ],
            references: ['Aviso n.º 12/2016, arts. 19.º, 23.º e 24.º', 'Lei n.º 24/21'],
        },
        {
            title: 'Utilização do sistema',
            paragraphs: [
                'Cada utilizador acede com credenciais pessoais e intransmissíveis e responde pelas operações realizadas com a sua conta. As operações relevantes (simulações convertidas, créditos, pagamentos, alterações de risco, configurações) ficam registadas na auditoria.',
                'É proibido usar o sistema para fins alheios à actividade da empresa, introduzir dados falsos ou tentar contornar os controlos de acesso e de aprovação.',
            ],
        },
        {
            title: 'Entidades de microcrédito',
            paragraphs: [
                'Quando a empresa exerça a actividade de microcrédito, observa o regime das sociedades e operadores de microcrédito, incluindo o registo especial no Banco Nacional de Angola antes do início da actividade.',
            ],
            references: ['Decreto Presidencial n.º 89/23', 'Aviso n.º 04/2023, art. 8.º'],
        },
        {
            title: 'Alterações',
            paragraphs: [
                `${company} pode alterar estes Termos para os adaptar à legislação ou às suas políticas. A versão em vigor está sempre disponível no sistema, com a data da última actualização.`,
            ],
        },
        {
            title: 'Lei aplicável e foro',
            paragraphs: [
                'Estes Termos regem-se pela lei da República de Angola. Para a resolução de litígios é competente o tribunal da comarca da sede da empresa, sem prejuízo das normas imperativas de protecção do consumidor e da possibilidade de reclamação junto do Banco Nacional de Angola.',
            ],
        },
    ];
    return articles.map((article, index) => ({ number: index + 1, ...article }));
}
