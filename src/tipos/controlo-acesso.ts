/**
 * Tango Gestão de Créditos ERP - Modelo de Controlo de Acessos Bancário (RBAC)
 * Definições de módulos, ações granulares, perfis bancários, exceções e alçadas.
 */

export type AreaModulo = 
  | 'comercial'
  | 'credito'
  | 'cobranca'
  | 'financeiro'
  | 'fiscal'
  | 'relatorios'
  | 'administracao';

export type AcaoPadrao = 'ver' | 'criar' | 'editar' | 'eliminar' | 'aprovar' | 'exportar';

export type AcaoEspecial =
  // Crédito
  | 'desembolsar'
  | 'reestruturar'
  | 'conceder_novo'
  // Cobrança
  | 'anular_pagamento'
  | 'validar_transferencia'
  | 'data_retroativa'
  | 'perdoar_juros'
  | 'conceder_desconto'
  // Financeiro e Contabilidade
  | 'estornar_lancamento'
  | 'fechar_periodo'
  | 'reabrir_periodo'
  | 'abater_credito'
  | 'executar_auditoria'
  | 'congelar_panico'
  // Administração
  | 'restaurar_lixeira'
  // Âmbito e dados sensíveis
  | 'ver_sensiveis';

export type AcaoModulo = AcaoPadrao | AcaoEspecial;

export interface DefinicaoModulo {
  id: string;
  nome: string;
  area: AreaModulo;
  acoesDisponiveis: AcaoModulo[];
  acoesCriticas?: AcaoModulo[];
  caminho?: string;
  legadoId?: string;
}

export interface ExcecaoPermissao {
  id: string;
  permissionId: string;
  tipo: 'conceder' | 'retirar'; // 'conceder' adiciona permissão que o perfil não tem; 'retirar' revoga permissão do perfil
  motivo: string;
  atribuidoPor: string;
  atribuidoEm: string;
  dataAtribuicao?: string; // Alias opcional para atribuidoEm
  dataExpiracao?: string; // Permissões temporárias (ex.: férias, substituições)
}

export interface ConfiguracaoAlcada {
  aprovacaoCreditoKz: number;
  requerDuplaAprovacaoAcimaKz?: number;
  desembolsoKz: number;
  perdaoJurosPct: number;
  perdaoJurosKz: number;
  anulacaoPagamentoKz: number;
  abateCreditoKz: number;
}

export type AmbitoDados = 'todos' | 'agencia' | 'carteira_propria' | 'all' | 'branch_only' | 'own_portfolio';

export interface PoliticaDadosUtilizador {
  ambito: AmbitoDados;
  agenciaId?: string;
  agenciaNome?: string;
  mascararDadosSensiveis: boolean;
  podeExportar: boolean;
}

export interface PerfilAcesso {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
  areaPrincipal: string;
  corBadge: string;
  permissoesBase: string[];
  alcadasPadrao: ConfiguracaoAlcada;
  duplaAprovacaoObrigatoria?: boolean;
  exigeDoisFatores: boolean;
  editavel?: boolean;
  predefinido?: boolean;
}

export interface HistoricoAlteracaoPermissao {
  id: string;
  utilizadorId: string;
  alteradoPorId: string;
  alteradoPorNome: string;
  dataHora: string;
  ip?: string;
  motivo: string;
  perfilAnterior: string;
  perfilNovo: string;
  diferencas: string[];
  aprovacaoDuplaPor?: string;
}

// Lista completa de módulos agrupados por área conforme o menu e regras de negócio
export const MODULOS_SISTEMA: DefinicaoModulo[] = [
  // 1. Comercial
  {
    id: 'clientes',
    nome: 'Clientes',
    area: 'comercial',
    acoesDisponiveis: ['ver', 'criar', 'editar', 'eliminar', 'exportar', 'ver_sensiveis'],
    acoesCriticas: ['eliminar'],
    caminho: '/clientes',
    legadoId: 'manage_clients'
  },
  {
    id: 'contactos',
    nome: 'Contactos',
    area: 'comercial',
    acoesDisponiveis: ['ver', 'criar', 'editar', 'eliminar', 'exportar'],
    caminho: '/contactos',
    legadoId: 'manage_clients'
  },
  {
    id: 'simulador',
    nome: 'Simulador',
    area: 'comercial',
    acoesDisponiveis: ['ver', 'criar', 'exportar'],
    caminho: '/simulador'
  },
  {
    id: 'garantias',
    nome: 'Garantias',
    area: 'comercial',
    acoesDisponiveis: ['ver', 'criar', 'editar', 'eliminar', 'aprovar', 'exportar'],
    acoesCriticas: ['aprovar', 'eliminar'],
    caminho: '/garantias',
    legadoId: 'manage_warranties'
  },

  // 2. Crédito
  {
    id: 'creditos',
    nome: 'Pedidos de Crédito',
    area: 'credito',
    acoesDisponiveis: ['ver', 'criar', 'editar', 'eliminar', 'aprovar', 'exportar', 'desembolsar', 'reestruturar', 'conceder_novo'],
    acoesCriticas: ['aprovar', 'desembolsar', 'reestruturar', 'eliminar'],
    caminho: '/creditos',
    legadoId: 'view_credits'
  },
  {
    id: 'aprovacoes',
    nome: 'Aprovações',
    area: 'credito',
    acoesDisponiveis: ['ver', 'aprovar', 'exportar'],
    acoesCriticas: ['aprovar'],
    caminho: '/aprovacoes',
    legadoId: 'approve_loans'
  },
  {
    id: 'contratos',
    nome: 'Contratos',
    area: 'credito',
    acoesDisponiveis: ['ver', 'criar', 'editar', 'eliminar', 'exportar'],
    caminho: '/contratos',
    legadoId: 'view_credits'
  },
  {
    id: 'plano_mensal',
    nome: 'Plano Mensal',
    area: 'credito',
    acoesDisponiveis: ['ver', 'exportar'],
    caminho: '/plano-mensal',
    legadoId: 'view_credits'
  },
  {
    id: 'scoring',
    nome: 'Análise de Risco (Scoring)',
    area: 'credito',
    acoesDisponiveis: ['ver', 'criar', 'editar', 'exportar'],
    caminho: '/scoring',
    legadoId: 'view_reports'
  },

  // 3. Cobrança
  {
    id: 'pagamentos',
    nome: 'Pagamentos',
    area: 'cobranca',
    acoesDisponiveis: ['ver', 'criar', 'editar', 'eliminar', 'exportar', 'anular_pagamento', 'validar_transferencia', 'data_retroativa', 'perdoar_juros', 'conceder_desconto'],
    acoesCriticas: ['anular_pagamento', 'validar_transferencia', 'data_retroativa', 'perdoar_juros', 'conceder_desconto', 'eliminar'],
    caminho: '/pagamentos',
    legadoId: 'manage_payments'
  },
  {
    id: 'hub_cobranca',
    nome: 'Hub de Cobrança',
    area: 'cobranca',
    acoesDisponiveis: ['ver', 'criar', 'editar', 'exportar'],
    caminho: '/hub-whatsapp',
    legadoId: 'manage_payments'
  },
  {
    id: 'contencioso',
    nome: 'Contencioso',
    area: 'cobranca',
    acoesDisponiveis: ['ver', 'criar', 'editar', 'eliminar', 'aprovar', 'exportar'],
    acoesCriticas: ['eliminar', 'aprovar'],
    caminho: '/contencioso',
    legadoId: 'manage_legal'
  },

  // 4. Financeiro e Contabilidade
  {
    id: 'contabilidade',
    nome: 'Contabilidade',
    area: 'financeiro',
    acoesDisponiveis: ['ver', 'criar', 'editar', 'eliminar', 'aprovar', 'exportar', 'estornar_lancamento', 'fechar_periodo', 'reabrir_periodo', 'abater_credito', 'executar_auditoria', 'congelar_panico'],
    acoesCriticas: ['estornar_lancamento', 'fechar_periodo', 'reabrir_periodo', 'abater_credito', 'congelar_panico'],
    caminho: '/contabilidade',
    legadoId: 'manage_fiscal'
  },
  {
    id: 'despesas',
    nome: 'Despesas',
    area: 'financeiro',
    acoesDisponiveis: ['ver', 'criar', 'editar', 'eliminar', 'aprovar', 'exportar'],
    acoesCriticas: ['aprovar', 'eliminar'],
    caminho: '/despesas',
    legadoId: 'manage_fiscal'
  },
  {
    id: 'cartas_bancarias',
    nome: 'Cartas Bancárias',
    area: 'financeiro',
    acoesDisponiveis: ['ver', 'criar', 'editar', 'eliminar', 'exportar'],
    caminho: '/cartas-transferencia',
    legadoId: 'view_credits'
  },
  {
    id: 'gateways',
    nome: 'Gateways de Pagamento',
    area: 'financeiro',
    acoesDisponiveis: ['ver', 'criar', 'editar', 'eliminar'],
    acoesCriticas: ['editar', 'eliminar'],
    caminho: '/portais-pagamento',
    legadoId: 'manage_gateways'
  },

  // 5. Fiscal
  {
    id: 'relatorios_fiscais',
    nome: 'Relatórios Fiscais',
    area: 'fiscal',
    acoesDisponiveis: ['ver', 'criar', 'exportar'],
    caminho: '/relatorios-fiscais',
    legadoId: 'manage_fiscal'
  },
  {
    id: 'saft',
    nome: 'SAF-T (AO)',
    area: 'fiscal',
    acoesDisponiveis: ['ver', 'criar', 'exportar'],
    acoesCriticas: ['criar'],
    caminho: '/relatorios-fiscais',
    legadoId: 'generate_fiscal_docs'
  },
  {
    id: 'facturas_electronicas',
    nome: 'Facturas Electrónicas',
    area: 'fiscal',
    acoesDisponiveis: ['ver', 'criar', 'editar', 'exportar'],
    caminho: '/relatorios-fiscais',
    legadoId: 'manage_fiscal'
  },

  // 6. Relatórios
  {
    id: 'relatorios_financeiros',
    nome: 'Relatórios Financeiros',
    area: 'relatorios',
    acoesDisponiveis: ['ver', 'exportar'],
    caminho: '/relatorios',
    legadoId: 'view_reports'
  },
  {
    id: 'relatorios_atividade',
    nome: 'Relatórios de Atividade',
    area: 'relatorios',
    acoesDisponiveis: ['ver', 'exportar'],
    caminho: '/relatorios-atividade',
    legadoId: 'view_user_reports'
  },

  // 7. Administração
  {
    id: 'utilizadores',
    nome: 'Utilizadores',
    area: 'administracao',
    acoesDisponiveis: ['ver', 'criar', 'editar', 'eliminar', 'exportar'],
    acoesCriticas: ['criar', 'editar', 'eliminar'],
    caminho: '/utilizadores',
    legadoId: 'manage_users'
  },
  {
    id: 'perfis',
    nome: 'Perfis de Acesso',
    area: 'administracao',
    acoesDisponiveis: ['ver', 'criar', 'editar', 'eliminar', 'exportar'],
    acoesCriticas: ['criar', 'editar', 'eliminar'],
    caminho: '/perfis',
    legadoId: 'manage_users'
  },
  {
    id: 'limites',
    nome: 'Limites e Alçadas',
    area: 'administracao',
    acoesDisponiveis: ['ver', 'editar'],
    acoesCriticas: ['editar'],
    caminho: '/limites-utilizador',
    legadoId: 'manage_limits'
  },
  {
    id: 'sessoes',
    nome: 'Sessões Ativas',
    area: 'administracao',
    acoesDisponiveis: ['ver', 'eliminar'],
    acoesCriticas: ['eliminar'],
    caminho: '/sessoes',
    legadoId: 'manage_users'
  },
  {
    id: 'auditoria',
    nome: 'Auditoria e Logs',
    area: 'administracao',
    acoesDisponiveis: ['ver', 'exportar'],
    caminho: '/logs-auditoria',
    legadoId: 'view_audit_logs'
  },
  {
    id: 'configuracoes',
    nome: 'Configurações de Sistema',
    area: 'administracao',
    acoesDisponiveis: ['ver', 'editar'],
    acoesCriticas: ['editar'],
    caminho: '/definicoes',
    legadoId: 'manage_settings'
  },
  {
    id: 'termos_politicas',
    nome: 'Termos e Políticas',
    area: 'administracao',
    acoesDisponiveis: ['ver', 'editar'],
    caminho: '/termos-e-politicas'
  },
  {
    id: 'lixeira',
    nome: 'Lixeira do Sistema',
    area: 'administracao',
    acoesDisponiveis: ['ver', 'eliminar', 'restaurar_lixeira'],
    acoesCriticas: ['eliminar', 'restaurar_lixeira'],
    caminho: '/lixeira',
    legadoId: 'manage_settings'
  }
];

export const DESCRICOES_ACOES: Record<AcaoModulo, { nome: string; descricao: string; critica?: boolean }> = {
  ver: { nome: 'Ver', descricao: 'Acesso de leitura ao módulo' },
  criar: { nome: 'Criar', descricao: 'Permissão para registar novos registos' },
  editar: { nome: 'Editar', descricao: 'Permissão para alterar registos existentes' },
  eliminar: { nome: 'Eliminar', descricao: 'Permissão para apagar ou desativar registos', critica: true },
  aprovar: { nome: 'Aprovar', descricao: 'Poder de decisão para aprovar ou rejeitar propostas', critica: true },
  exportar: { nome: 'Exportar', descricao: 'Capacidade de transferir dados para Excel ou PDF' },
  desembolsar: { nome: 'Desembolsar', descricao: 'Efetuar liquidação e libertação de capital ao cliente', critica: true },
  reestruturar: { nome: 'Reestruturar', descricao: 'Alterar condições contratuais de créditos em curso', critica: true },
  conceder_novo: { nome: 'Conceder Novo Crédito', descricao: 'Abertura de novas linhas de crédito para clientes' },
  anular_pagamento: { nome: 'Anular Pagamento', descricao: 'Reversão total ou parcial de recebimentos registados', critica: true },
  validar_transferencia: { nome: 'Validar Transferências', descricao: 'Confirmar a entrada no banco de transferências e depósitos pendentes', critica: true },
  data_retroativa: { nome: 'Registar com Data Retroactiva', descricao: 'Registar pagamentos com data-valor anterior a hoje (recalcula a mora)', critica: true },
  perdoar_juros: { nome: 'Perdoar Juros', descricao: 'Dispensa de cobrança de encargos e mora', critica: true },
  conceder_desconto: { nome: 'Conceder Desconto', descricao: 'Abatimento negociado no saldo em dívida', critica: true },
  estornar_lancamento: { nome: 'Estornar Lançamento', descricao: 'Anulação de operações contabilísticas já integradas', critica: true },
  fechar_periodo: { nome: 'Fechar Período', descricao: 'Bloqueio do mês contabilístico contra novas alterações', critica: true },
  reabrir_periodo: { nome: 'Reabrir Período', descricao: 'Destrancamento de meses contabilísticos anteriores', critica: true },
  abater_credito: { nome: 'Abater Crédito (Write-off)', descricao: 'Passagem do crédito a perda / incobrável', critica: true },
  executar_auditoria: { nome: 'Executar Auditoria', descricao: 'Correr processos globais de validação de integridade' },
  congelar_panico: { nome: 'Congelar Movimentação (Pânico)', descricao: 'Bloqueio de emergência de toda a operação bancária', critica: true },
  restaurar_lixeira: { nome: 'Restaurar da Lixeira', descricao: 'Recuperação de registos eliminados', critica: true },
  ver_sensiveis: { nome: 'Ver Dados Sensíveis', descricao: 'Desmascara NIF, BI, telefone e IBAN completos' }
};

export const ROTULOS_AREAS: Record<AreaModulo, { nome: string; descricao: string; cor: string }> = {
  comercial: { nome: 'Comercial', descricao: 'Clientes, simulações, contactos e garantias', cor: 'sky' },
  credito: { nome: 'Crédito', descricao: 'Propostas, aprovações, contratos e análise de risco', cor: 'amber' },
  cobranca: { nome: 'Cobrança', descricao: 'Recebimentos, negociações e contencioso', cor: 'emerald' },
  financeiro: { nome: 'Financeiro e Contabilidade', descricao: 'Plano contabilístico, tesouraria e despesas', cor: 'purple' },
  fiscal: { nome: 'Fiscal', descricao: 'Relatórios AGT, SAF-T (AO) e facturação', cor: 'indigo' },
  relatorios: { nome: 'Relatórios', descricao: 'Painéis analíticos, indicadores e auditoria de equipa', cor: 'blue' },
  administracao: { nome: 'Administração', descricao: 'Utilizadores, perfis, segurança e configurações', cor: 'rose' }
};

// Matriz de conflitos de segregação de funções (Princípio dos Quatro Olhos)
export interface ConflitoSegregacao {
  id: string;
  nome: string;
  descricao: string;
  permissoesConflitantes: string[];
}

export const CONFLITOS_SEGREGAO_FUNCOES: ConflitoSegregacao[] = [
  {
    id: 'credito_criar_aprovar',
    nome: 'Criação e Aprovação de Crédito',
    descricao: 'Quem propõe um crédito não deve ter poder de decisão sobre a sua aprovação final.',
    permissoesConflitantes: ['creditos.criar', 'creditos.aprovar']
  },
  {
    id: 'credito_aprovar_desembolsar',
    nome: 'Aprovação e Desembolso de Crédito',
    descricao: 'Quem aprova o crédito não pode executar a transferência financeira de desembolso.',
    permissoesConflitantes: ['creditos.aprovar', 'creditos.desembolsar']
  },
  {
    id: 'pagamento_registar_anular',
    nome: 'Registo e Anulação de Pagamento',
    descricao: 'O operador que valida o recebimento em caixa não pode anular nem estornar o recibo.',
    permissoesConflitantes: ['pagamentos.criar', 'pagamentos.anular_pagamento']
  },
  {
    id: 'contabilidade_lancar_estornar',
    nome: 'Lançamento e Estorno Contabilístico',
    descricao: 'Lançamentos de diário não devem ser estornados pelo mesmo colaborador sem revisão.',
    permissoesConflitantes: ['contabilidade.criar', 'contabilidade.estornar_lancamento']
  },
  {
    id: 'risco_analise_aprovacao',
    nome: 'Parecer de Risco e Aprovação Financeira',
    descricao: 'O analista que emite parecer independente de risco não deve aprovar comercialmente a operação.',
    permissoesConflitantes: ['scoring.criar', 'creditos.aprovar']
  }
];

// Helper para compor ID de permissão
export const comporPermissao = (moduloId: string, acao: AcaoModulo): string => `${moduloId}.${acao}`;

// 11 Perfis bancários predefinidos do modelo bancário
export const PERFIS_PREDEFINIDOS: PerfilAcesso[] = [
  {
    id: 'super_admin',
    codigo: 'SUPER_ADMIN',
    nome: 'Super Administrador',
    descricao: 'Acesso total a todas as áreas, parametrizações e operações bancárias. Tem de existir sempre pelo menos um no sistema.',
    areaPrincipal: 'administracao',
    corBadge: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900',
    permissoesBase: MODULOS_SISTEMA.flatMap(m => m.acoesDisponiveis.map(a => comporPermissao(m.id, a))),
    alcadasPadrao: {
      aprovacaoCreditoKz: 100_000_000,
      requerDuplaAprovacaoAcimaKz: 10_000_000,
      desembolsoKz: 100_000_000,
      perdaoJurosPct: 100,
      perdaoJurosKz: 10_000_000,
      anulacaoPagamentoKz: 50_000_000,
      abateCreditoKz: 50_000_000
    },
    exigeDoisFatores: true,
    editavel: false,
    predefinido: true
  },
  {
    id: 'system_admin',
    codigo: 'ADMIN_SISTEMA',
    nome: 'Administrador de Sistema',
    descricao: 'Gestão de utilizadores, perfis, integrações, auditoria e configurações gerais. Sem acesso a movimentações e aprovações financeiras.',
    areaPrincipal: 'administracao',
    corBadge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900',
    permissoesBase: [
      'utilizadores.ver', 'utilizadores.criar', 'utilizadores.editar', 'utilizadores.eliminar', 'utilizadores.exportar',
      'perfis.ver', 'perfis.criar', 'perfis.editar', 'perfis.eliminar', 'perfis.exportar',
      'limites.ver', 'limites.editar',
      'sessoes.ver', 'sessoes.eliminar',
      'auditoria.ver', 'auditoria.exportar',
      'configuracoes.ver', 'configuracoes.editar',
      'termos_politicas.ver', 'termos_politicas.editar',
      'lixeira.ver', 'lixeira.restaurar_lixeira',
      'gateways.ver', 'gateways.criar', 'gateways.editar',
      'relatorios_atividade.ver', 'relatorios_atividade.exportar'
    ],
    alcadasPadrao: {
      aprovacaoCreditoKz: 0,
      desembolsoKz: 0,
      perdaoJurosPct: 0,
      perdaoJurosKz: 0,
      anulacaoPagamentoKz: 0,
      abateCreditoKz: 0
    },
    exigeDoisFatores: true,
    editavel: true,
    predefinido: true
  },
  {
    id: 'credit_director',
    codigo: 'DIR_CREDITO',
    nome: 'Diretor de Crédito',
    descricao: 'Aprovações financeiras até à alçada mais alta, supervisão executiva da carteira, reestruturações e relatórios estratégicos.',
    areaPrincipal: 'credito',
    corBadge: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-900',
    permissoesBase: [
      'clientes.ver', 'clientes.exportar', 'clientes.ver_sensiveis',
      'contactos.ver', 'simulador.ver', 'simulador.criar', 'simulador.exportar',
      'garantias.ver', 'garantias.aprovar', 'garantias.exportar',
      'creditos.ver', 'creditos.aprovar', 'creditos.reestruturar', 'creditos.exportar',
      'aprovacoes.ver', 'aprovacoes.aprovar', 'aprovacoes.exportar',
      'contratos.ver', 'contratos.exportar',
      'plano_mensal.ver', 'plano_mensal.exportar',
      'scoring.ver', 'scoring.exportar',
      'pagamentos.ver', 'pagamentos.exportar', 'pagamentos.anular_pagamento', 'pagamentos.validar_transferencia', 'pagamentos.perdoar_juros', 'pagamentos.conceder_desconto',
      'hub_cobranca.ver', 'contencioso.ver', 'contencioso.aprovar',
      'relatorios_financeiros.ver', 'relatorios_financeiros.exportar',
      'relatorios_atividade.ver', 'relatorios_atividade.exportar',
      'auditoria.ver'
    ],
    alcadasPadrao: {
      aprovacaoCreditoKz: 5_000_000,
      requerDuplaAprovacaoAcimaKz: 5_000_000,
      desembolsoKz: 5_000_000,
      perdaoJurosPct: 50,
      perdaoJurosKz: 1_000_000,
      anulacaoPagamentoKz: 2_000_000,
      abateCreditoKz: 5_000_000
    },
    exigeDoisFatores: true,
    editavel: true,
    predefinido: true
  },
  {
    id: 'manager',
    codigo: 'GESTOR_CREDITO',
    nome: 'Gestor de Crédito',
    descricao: 'Instrução de pedidos de crédito, análise de documentação e aprovação dentro da alçada operacional (até 500 000 Kz).',
    areaPrincipal: 'credito',
    corBadge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900',
    permissoesBase: [
      'clientes.ver', 'clientes.criar', 'clientes.editar', 'clientes.exportar', 'clientes.ver_sensiveis',
      'contactos.ver', 'contactos.criar', 'contactos.editar',
      'simulador.ver', 'simulador.criar', 'simulador.exportar',
      'garantias.ver', 'garantias.criar', 'garantias.editar',
      'creditos.ver', 'creditos.criar', 'creditos.editar', 'creditos.aprovar', 'creditos.conceder_novo', 'creditos.exportar',
      'aprovacoes.ver', 'aprovacoes.aprovar',
      'contratos.ver', 'contratos.criar', 'contratos.editar', 'contratos.exportar',
      'plano_mensal.ver', 'plano_mensal.exportar',
      'scoring.ver', 'scoring.criar',
      'pagamentos.ver',
      'hub_cobranca.ver',
      'relatorios_financeiros.ver'
    ],
    alcadasPadrao: {
      aprovacaoCreditoKz: 500_000,
      desembolsoKz: 500_000,
      perdaoJurosPct: 10,
      perdaoJurosKz: 50_000,
      anulacaoPagamentoKz: 0,
      abateCreditoKz: 0
    },
    exigeDoisFatores: true,
    editavel: true,
    predefinido: true
  },
  {
    id: 'commercial_manager',
    codigo: 'GESTOR_COMERCIAL',
    nome: 'Gestor Comercial',
    descricao: 'Angariação de clientes, simulações e submissão de pedidos. Sem permissão de aprovação. Vê apenas os seus clientes.',
    areaPrincipal: 'comercial',
    corBadge: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900',
    permissoesBase: [
      'clientes.ver', 'clientes.criar', 'clientes.editar',
      'contactos.ver', 'contactos.criar', 'contactos.editar',
      'simulador.ver', 'simulador.criar', 'simulador.exportar',
      'garantias.ver', 'garantias.criar',
      'creditos.ver', 'creditos.criar',
      'plano_mensal.ver'
    ],
    alcadasPadrao: {
      aprovacaoCreditoKz: 0,
      desembolsoKz: 0,
      perdaoJurosPct: 0,
      perdaoJurosKz: 0,
      anulacaoPagamentoKz: 0,
      abateCreditoKz: 0
    },
    exigeDoisFatores: false,
    editavel: true,
    predefinido: true
  },
  {
    id: 'risk_analyst',
    codigo: 'ANALISTA_RISCO',
    nome: 'Analista de Risco',
    descricao: 'Avaliação técnica de capacidade de endividamento, scoring e parecer de risco. Não aprova nem desembolsa créditos.',
    areaPrincipal: 'credito',
    corBadge: 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-900',
    permissoesBase: [
      'clientes.ver', 'clientes.ver_sensiveis',
      'contactos.ver',
      'simulador.ver',
      'garantias.ver',
      'creditos.ver',
      'scoring.ver', 'scoring.criar', 'scoring.editar', 'scoring.exportar',
      'plano_mensal.ver',
      'relatorios_financeiros.ver'
    ],
    alcadasPadrao: {
      aprovacaoCreditoKz: 0,
      desembolsoKz: 0,
      perdaoJurosPct: 0,
      perdaoJurosKz: 0,
      anulacaoPagamentoKz: 0,
      abateCreditoKz: 0
    },
    exigeDoisFatores: false,
    editavel: true,
    predefinido: true
  },
  {
    id: 'cashier',
    codigo: 'OPERADOR_CAIXA',
    nome: 'Operador de Caixa',
    descricao: 'Registo de pagamentos, aberturas e fechos de caixa e emissão de recibos. Não aprova créditos nem anula pagamentos.',
    areaPrincipal: 'cobranca',
    corBadge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
    permissoesBase: [
      'clientes.ver',
      'creditos.ver',
      'plano_mensal.ver',
      'pagamentos.ver', 'pagamentos.criar', 'pagamentos.exportar',
      'cartas_bancarias.ver'
    ],
    alcadasPadrao: {
      aprovacaoCreditoKz: 0,
      desembolsoKz: 0,
      perdaoJurosPct: 0,
      perdaoJurosKz: 0,
      anulacaoPagamentoKz: 0,
      abateCreditoKz: 0
    },
    exigeDoisFatores: false,
    editavel: true,
    predefinido: true
  },
  {
    id: 'collection_officer',
    codigo: 'TEC_COBRANCA',
    nome: 'Técnico de Cobrança',
    descricao: 'Gestão de clientes em incumprimento, envio de lembretes no Hub e negociação de planos de regularização.',
    areaPrincipal: 'cobranca',
    corBadge: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-900',
    permissoesBase: [
      'clientes.ver', 'clientes.editar', 'clientes.ver_sensiveis',
      'contactos.ver', 'contactos.criar', 'contactos.editar',
      'creditos.ver',
      'plano_mensal.ver',
      'pagamentos.ver',
      'hub_cobranca.ver', 'hub_cobranca.criar', 'hub_cobranca.editar', 'hub_cobranca.exportar',
      'contencioso.ver', 'contencioso.criar'
    ],
    alcadasPadrao: {
      aprovacaoCreditoKz: 0,
      desembolsoKz: 0,
      perdaoJurosPct: 5,
      perdaoJurosKz: 20_000,
      anulacaoPagamentoKz: 0,
      abateCreditoKz: 0
    },
    exigeDoisFatores: false,
    editavel: true,
    predefinido: true
  },
  {
    id: 'accountant',
    codigo: 'CONTABILISTA',
    nome: 'Contabilista',
    descricao: 'Contabilidade geral, plano de contas, registo de despesas, estornos contabilísticos autorizados e fecho de período.',
    areaPrincipal: 'financeiro',
    corBadge: 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-900',
    permissoesBase: [
      'clientes.ver',
      'creditos.ver',
      'pagamentos.ver', 'pagamentos.exportar', 'pagamentos.validar_transferencia', 'pagamentos.anular_pagamento',
      'contabilidade.ver', 'contabilidade.criar', 'contabilidade.editar', 'contabilidade.exportar', 'contabilidade.estornar_lancamento', 'contabilidade.fechar_periodo', 'contabilidade.reabrir_periodo',
      'despesas.ver', 'despesas.criar', 'despesas.editar', 'despesas.aprovar', 'despesas.exportar',
      'cartas_bancarias.ver', 'cartas_bancarias.criar', 'cartas_bancarias.exportar',
      'gateways.ver',
      'relatorios_fiscais.ver', 'relatorios_fiscais.criar', 'relatorios_fiscais.exportar',
      'saft.ver', 'saft.criar', 'saft.exportar',
      'facturas_electronicas.ver', 'facturas_electronicas.criar', 'facturas_electronicas.exportar',
      'relatorios_financeiros.ver', 'relatorios_financeiros.exportar'
    ],
    alcadasPadrao: {
      aprovacaoCreditoKz: 0,
      desembolsoKz: 0,
      perdaoJurosPct: 0,
      perdaoJurosKz: 0,
      anulacaoPagamentoKz: 1_000_000,
      abateCreditoKz: 0
    },
    exigeDoisFatores: true,
    editavel: true,
    predefinido: true
  },
  {
    id: 'legal',
    codigo: 'JURIDICO',
    nome: 'Jurídico',
    descricao: 'Contencioso e cobrança judicial, execução de garantias reais e conformidade contratual.',
    areaPrincipal: 'cobranca',
    corBadge: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-900',
    permissoesBase: [
      'clientes.ver', 'clientes.ver_sensiveis',
      'creditos.ver',
      'contratos.ver', 'contratos.editar', 'contratos.exportar',
      'garantias.ver', 'garantias.editar', 'garantias.exportar',
      'contencioso.ver', 'contencioso.criar', 'contencioso.editar', 'contencioso.aprovar', 'contencioso.exportar',
      'cartas_bancarias.ver',
      'termos_politicas.ver', 'termos_politicas.editar'
    ],
    alcadasPadrao: {
      aprovacaoCreditoKz: 0,
      desembolsoKz: 0,
      perdaoJurosPct: 0,
      perdaoJurosKz: 0,
      anulacaoPagamentoKz: 0,
      abateCreditoKz: 2_000_000
    },
    exigeDoisFatores: false,
    editavel: true,
    predefinido: true
  },
  {
    id: 'internal_auditor',
    codigo: 'AUDITOR_INTERNO',
    nome: 'Auditor Interno',
    descricao: 'Acesso estritamente de leitura em todos os módulos, registos contabilísticos e logs de auditoria. Não altera nada.',
    areaPrincipal: 'administracao',
    corBadge: 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-800',
    permissoesBase: MODULOS_SISTEMA.flatMap(m => {
      const perms = ['ver'];
      if (m.acoesDisponiveis.includes('exportar')) perms.push('exportar');
      if (m.acoesDisponiveis.includes('ver_sensiveis')) perms.push('ver_sensiveis');
      return perms.map(a => comporPermissao(m.id, a as AcaoModulo));
    }),
    alcadasPadrao: {
      aprovacaoCreditoKz: 0,
      desembolsoKz: 0,
      perdaoJurosPct: 0,
      perdaoJurosKz: 0,
      anulacaoPagamentoKz: 0,
      abateCreditoKz: 0
    },
    exigeDoisFatores: true,
    editavel: false,
    predefinido: true
  },
  // Perfil legado para retrocompatibilidade com 'admin'
  {
    id: 'admin',
    codigo: 'ADMIN_GERAL',
    nome: 'Administrador',
    descricao: 'Perfil legado de administração geral e supervisão financeira.',
    areaPrincipal: 'administracao',
    corBadge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
    permissoesBase: [
      'clientes.ver', 'clientes.criar', 'clientes.editar', 'clientes.exportar', 'clientes.ver_sensiveis',
      'contactos.ver', 'contactos.criar', 'contactos.editar',
      'simulador.ver', 'simulador.criar',
      'creditos.ver', 'creditos.criar', 'creditos.editar', 'creditos.aprovar', 'creditos.desembolsar',
      'aprovacoes.ver', 'aprovacoes.aprovar',
      'pagamentos.ver', 'pagamentos.criar', 'pagamentos.editar', 'pagamentos.exportar', 'pagamentos.validar_transferencia', 'pagamentos.data_retroativa',
      'relatorios_financeiros.ver', 'relatorios_financeiros.exportar',
      'configuracoes.ver', 'configuracoes.editar',
      'auditoria.ver', 'auditoria.exportar',
      'limites.ver', 'limites.editar'
    ],
    alcadasPadrao: {
      aprovacaoCreditoKz: 1_000_000,
      desembolsoKz: 1_000_000,
      perdaoJurosPct: 20,
      perdaoJurosKz: 100_000,
      anulacaoPagamentoKz: 500_000,
      abateCreditoKz: 500_000
    },
    exigeDoisFatores: true,
    editavel: true,
    predefinido: true
  }
];
