// Termos de Utilização e Política de Privacidade do próprio sistema (software Tango Gestão de Créditos),
// aceites por quem inicia sessão. Os termos de crédito para os clientes estão em termos-legais.ts.

export const SYSTEM_TERMS_VERSION = '1.0';
export const SYSTEM_TERMS_UPDATED_AT = '11 de Outubro de 2026';
export const SYSTEM_TERMS_PROVIDER = 'DIGITAL NORTE - COMÉRCIO E PRESTAÇÃO DE SERVIÇOS, (SU), LDA';

export type SystemTermsSection = { title: string; paragraphs: string[] };

export const SYSTEM_TERMS_OF_USE: SystemTermsSection[] = [
    {
        title: '1. Objecto',
        paragraphs: [
            `O Tango Gestão de Créditos é um sistema de gestão de crédito fornecido por ${SYSTEM_TERMS_PROVIDER} (o «Fornecedor») às empresas licenciadas no Tango Master (a «Empresa»). Estes Termos regulam a utilização do sistema, na aplicação de computador e na versão web, por todos os utilizadores da Empresa.`,
        ],
    },
    {
        title: '2. Acesso e credenciais',
        paragraphs: [
            'O acesso exige o NIF e o Código de Acesso da Empresa, atribuídos no Tango Master, e credenciais pessoais (email ou nome de utilizador e palavra-passe) criadas pela Empresa para cada utilizador.',
            'As credenciais são pessoais e intransmissíveis. O utilizador responde pelas operações feitas com a sua conta, deve guardar a palavra-passe em segurança e avisar de imediato o administrador da Empresa em caso de perda ou uso indevido.',
            'Após tentativas falhadas sucessivas a conta é bloqueada temporariamente. A Empresa pode limitar o acesso por horário, por perfil e por autenticação de dois factores.',
        ],
    },
    {
        title: '3. Utilização permitida',
        paragraphs: [
            'O sistema destina-se exclusivamente à actividade da Empresa: simulação, concessão, gestão e cobrança de crédito, contabilidade e relatórios.',
            'É proibido introduzir dados falsos, aceder a informação sem necessidade funcional, tentar contornar os controlos de acesso, limites e aprovações, copiar ou extrair dados para fins alheios à Empresa, ou interferir com o funcionamento e a segurança do sistema.',
        ],
    },
    {
        title: '4. Registo de operações e auditoria',
        paragraphs: [
            'As operações relevantes (créditos, pagamentos, alterações de risco e de configuração, acessos e tentativas falhadas) ficam registadas com o utilizador, a data e a hora, num registo de auditoria protegido contra alterações.',
        ],
    },
    {
        title: '5. Sincronização e disponibilidade',
        paragraphs: [
            'Os dados ficam guardados no dispositivo e, quando a sincronização está activa, são enviados cifrados para o servidor central, para estarem disponíveis nos outros dispositivos da Empresa.',
            'O Fornecedor procura manter o serviço disponível, mas podem ocorrer interrupções por manutenção, falhas de rede ou causas alheias ao seu controlo. A Empresa deve manter as cópias de segurança configuradas no sistema.',
        ],
    },
    {
        title: '6. Licença e subscrição',
        paragraphs: [
            'O direito de utilização depende de licença ou subscrição válida emitida no Tango Master. Terminada a validade, suspensa ou revogada a licença, o acesso pode ser bloqueado até à renovação.',
            'O software, a marca e a documentação pertencem ao Fornecedor. Não é permitido copiar, modificar, descompilar ou redistribuir o sistema.',
        ],
    },
    {
        title: '7. Responsabilidade',
        paragraphs: [
            'Os cálculos do sistema seguem as regras configuradas pela Empresa e a legislação aplicável. As decisões de crédito, a exactidão dos dados introduzidos e o cumprimento das obrigações legais e regulamentares da actividade são da responsabilidade da Empresa e dos seus utilizadores.',
        ],
    },
    {
        title: '8. Alterações e lei aplicável',
        paragraphs: [
            'Estes Termos podem ser actualizados; quando isso acontecer, será pedida nova aceitação no início de sessão. Regem-se pela lei da República de Angola.',
        ],
    },
];

export const SYSTEM_PRIVACY_POLICY: SystemTermsSection[] = [
    {
        title: '1. Responsáveis pelo tratamento',
        paragraphs: [
            'A Empresa é responsável pelo tratamento dos dados pessoais dos seus clientes, garantes e trabalhadores registados no sistema. O Fornecedor trata esses dados apenas por conta da Empresa, para prestar o serviço, e não os utiliza para outros fins.',
        ],
    },
    {
        title: '2. Dados tratados',
        paragraphs: [
            'Utilizadores: nome, email, nome de utilizador, perfil e permissões, palavra-passe (guardada apenas de forma irreversível, nunca em texto legível), endereço IP, datas de acesso e operações efectuadas.',
            'Clientes e garantes: dados de identificação (nome, BI ou NIF, contactos, morada), dados profissionais e financeiros necessários à análise de crédito, contratos, pagamentos e histórico de cobrança.',
        ],
    },
    {
        title: '3. Finalidades',
        paragraphs: [
            'Análise, concessão, gestão e cobrança de crédito; cumprimento de obrigações legais e regulamentares (BNA, Central de Informação de Risco de Crédito, prevenção do branqueamento de capitais, obrigações fiscais); segurança do sistema e auditoria; comunicação com os clientes.',
        ],
    },
    {
        title: '4. Segurança',
        paragraphs: [
            'A base de dados local é cifrada; a sincronização entre dispositivos é cifrada com a chave da Empresa antes de sair do dispositivo, pelo que o servidor central não consegue ler o seu conteúdo. O acesso é controlado por perfil, com registo de auditoria e cópias de segurança.',
        ],
    },
    {
        title: '5. Partilha de dados',
        paragraphs: [
            'Os dados não são vendidos nem cedidos a terceiros. Só são comunicados quando a lei o exige (por exemplo, ao Banco Nacional de Angola, à Administração Geral Tributária ou a autoridades judiciais) ou com o consentimento do titular.',
        ],
    },
    {
        title: '6. Conservação',
        paragraphs: [
            'Os dados são conservados durante a relação contratual e, depois dela, pelos prazos exigidos pela lei (nomeadamente contabilísticos, fiscais e de prevenção do branqueamento de capitais). Findos esses prazos, são eliminados ou anonimizados.',
        ],
    },
    {
        title: '7. Direitos dos titulares',
        paragraphs: [
            'Os titulares podem pedir à Empresa o acesso, a rectificação, a actualização e, quando a lei o permita, a eliminação dos seus dados, bem como opor-se a tratamentos não obrigatórios, nos termos da Lei n.º 22/11, de 17 de Junho (Lei da Protecção de Dados Pessoais). Podem ainda dirigir-se à Agência de Protecção de Dados.',
        ],
    },
    {
        title: '8. Armazenamento no dispositivo',
        paragraphs: [
            'O sistema guarda no dispositivo apenas o necessário ao seu funcionamento (dados da Empresa, preferências, sessão e esta aceitação). Não são usados cookies de publicidade nem de rastreio.',
        ],
    },
];

const ACCEPTANCE_KEY = 'tango_system_terms_acceptance';

/** Já foi aceite a versão em vigor neste dispositivo? */
export const hasAcceptedSystemTerms = (): boolean => {
    try {
        const saved = JSON.parse(localStorage.getItem(ACCEPTANCE_KEY) || 'null');
        return saved?.version === SYSTEM_TERMS_VERSION;
    } catch {
        return false;
    }
};

export const acceptSystemTerms = () => {
    try {
        localStorage.setItem(ACCEPTANCE_KEY, JSON.stringify({ version: SYSTEM_TERMS_VERSION, acceptedAt: new Date().toISOString() }));
    } catch {
        // Armazenamento indisponível: volta a ser pedida na próxima abertura.
    }
};
