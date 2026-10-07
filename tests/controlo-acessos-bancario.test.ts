import test from 'node:test';
import assert from 'node:assert/strict';
import { ServicoControloAcesso } from '../src/servicos/ServicoControloAcesso.ts';
import type { User } from '../src/tipos/autenticacao.ts';

test('1. Operador de Caixa tenta aprovar crédito diretamente via chamada/serviço -> Bloqueado (403) e registado', () => {
  const operadorCaixa: Partial<User> = {
    id: 'user_caixa_01',
    name: 'Ana Caixa',
    email: 'ana.caixa@banco.ao',
    role: 'cashier', // Operador de Caixa
    status: 'active',
    permissionExceptions: []
  };

  // Verifica que operador de caixa não possui a permissão de aprovação
  const temPermissao = ServicoControloAcesso.temPermissao(operadorCaixa, 'creditos.aprovar');
  assert.equal(temPermissao, false, 'Operador de Caixa não deve ter permissão para aprovar créditos');

  // Ao tentar executar a ação no backend/serviço, deve lançar erro 403
  assert.throws(
    () => {
      ServicoControloAcesso.verificarPermissao(operadorCaixa, 'creditos.aprovar', 'Aprovação de Crédito');
    },
    (err: any) => {
      assert.equal(err.status, 403);
      assert.match(err.message, /\[403 Proibido\]/);
      assert.match(err.message, /creditos\.aprovar/);
      return true;
    },
    'Deve lançar exceção 403 de acesso negado'
  );
});

test('2. Gestor de Crédito cria pedido e tenta aprová-lo -> Bloqueado por Segregação de Funções (Quatro Olhos)', () => {
  const gestorCredito: Partial<User> = {
    id: 'gestor_007',
    name: 'Carlos Gestor',
    email: 'carlos.gestor@banco.ao',
    role: 'credit_manager', // Gestor de Crédito tem permissão de aprovar na sua alçada
    status: 'active'
  };

  // O pedido foi criado pelo próprio Carlos Gestor
  const contextoProposta = {
    criadoPorId: 'gestor_007', // Mesmo ID do utilizador que tenta aprovar
  };

  assert.throws(
    () => {
      ServicoControloAcesso.verificarSegregacaoQuatroOlhos(
        'aprovar_credito',
        gestorCredito,
        contextoProposta
      );
    },
    (err: any) => {
      assert.match(err.message, /Princípio dos Quatro Olhos/);
      assert.match(err.message, /Quem submete ou cria uma proposta de crédito não pode aprová-la/);
      return true;
    },
    'Deve bloquear aprovação do próprio crédito criado'
  );

  // Também testa aprovador tentando desembolsar
  assert.throws(
    () => {
      ServicoControloAcesso.verificarSegregacaoQuatroOlhos(
        'desembolsar_credito',
        gestorCredito,
        { aprovadoPorId: 'gestor_007' }
      );
    },
    (err: any) => {
      assert.match(err.message, /Quem aprovou a proposta de crédito não pode efetuar o desembolso/);
      return true;
    }
  );
});

test('3. Gestor de Crédito tenta aprovar 2.000.000 Kz com alçada de 500.000 Kz -> Encaminhado para o Diretor', () => {
  const gestorCredito: Partial<User> = {
    id: 'gestor_008',
    name: 'Maria Gestora',
    role: 'credit_manager',
    status: 'active',
    approvalLimits: {
      aprovacaoCreditoKz: 500_000,
      desembolsoKz: 500_000,
      perdaoJurosKz: 50_000,
      anulacaoPagamentoKz: 0,
      abateCreditoKz: 0
    }
  };

  // Montante dentro da alçada: 350.000 Kz -> Autorizado
  const dentroAlcada = ServicoControloAcesso.verificarAlcada(gestorCredito, 350_000, 'aprovacao_credito');
  assert.equal(dentroAlcada.autorizado, true);
  assert.equal(dentroAlcada.limiteUtilizadorKz, 500_000);

  // Montante superior à alçada: 2.000.000 Kz -> Exceção informando encaminhamento para Diretor de Crédito
  assert.throws(
    () => {
      ServicoControloAcesso.verificarAlcada(gestorCredito, 2_000_000, 'aprovacao_credito');
    },
    (err: any) => {
      assert.equal(err.status, 403);
      assert.equal(err.excedeAlcada, true);
      assert.equal(err.encaminhadoPara, 'Diretor de Crédito');
      assert.match(err.message, /excede a sua alçada autorizada/);
      assert.match(err.message, /Diretor de Crédito/);
      return true;
    },
    'Deve bloquear e encaminhar para Diretor de Crédito'
  );
});

test('4. Um utilizador tenta alterar as próprias permissões -> Bloqueado', () => {
  const usuarioId = 'usr_antonio_123';

  assert.throws(
    () => {
      ServicoControloAcesso.verificarAutoAlteracao(usuarioId, usuarioId);
    },
    (err: any) => {
      assert.match(err.message, /Não é permitido alterar o seu próprio perfil ou permissões/);
      return true;
    },
    'Deve impedir auto-alteração de perfil ou permissões'
  );

  // Alteração de outro utilizador é permitida
  assert.doesNotThrow(() => {
    ServicoControloAcesso.verificarAutoAlteracao('admin_01', 'outro_usuario_02');
  });
});

test('5. Tentativa de desativar ou rebaixar o último Super Administrador ativo -> Bloqueada', () => {
  const listaUtilizadores: User[] = [
    {
      id: 'super_01',
      name: 'Dr. Pedro Morais Tango',
      email: 'pedro@tango.ao',
      role: 'super_admin',
      status: 'active',
      createdAt: new Date().toISOString()
    },
    {
      id: 'usr_02',
      name: 'João Operador',
      email: 'joao@tango.ao',
      role: 'cashier',
      status: 'active',
      createdAt: new Date().toISOString()
    }
  ];

  // Tentativa de desativar o único super admin ativo
  assert.throws(
    () => {
      ServicoControloAcesso.verificarUltimoSuperAdmin(listaUtilizadores, 'super_01', 'inactive');
    },
    (err: any) => {
      assert.match(err.message, /último Super Administrador ativo/);
      return true;
    },
    'Deve bloquear desativação do último Super Administrador'
  );

  // Tentativa de mudar o perfil do último super admin para outro perfil
  assert.throws(
    () => {
      ServicoControloAcesso.verificarUltimoSuperAdmin(listaUtilizadores, 'super_01', 'active', 'manager');
    },
    (err: any) => {
      assert.match(err.message, /último Super Administrador ativo/);
      return true;
    },
    'Deve bloquear rebaixamento do perfil do último Super Administrador'
  );

  // Se houver dois Super Admins, a desativação de um deles é permitida
  const listaComDoisSuperAdmins: User[] = [
    ...listaUtilizadores,
    {
      id: 'super_02',
      name: 'Dra. Luísa SuperAdmin',
      email: 'luisa@tango.ao',
      role: 'super_admin',
      status: 'active',
      createdAt: new Date().toISOString()
    }
  ];

  assert.doesNotThrow(() => {
    ServicoControloAcesso.verificarUltimoSuperAdmin(listaComDoisSuperAdmins, 'super_01', 'inactive');
  });
});

test('6. Gestor Comercial só vê os seus clientes, e o NIF aparece mascarado', () => {
  const gestorComercial: Partial<User> = {
    id: 'comercial_joao',
    name: 'João Comercial',
    role: 'commercial_manager',
    dataScope: 'own_portfolio',
    status: 'active'
    // Não tem permissão 'clientes.ver_sensiveis'
  };

  const bancoClientes = [
    {
      id: 'cli_01',
      nome: 'Empresa Alpha Lda',
      nif: '5001234567LA042',
      bi: '003412345LA042',
      telefone: '+244 923 456 789',
      iban: 'AO06004000001234567890123',
      gestorContaId: 'comercial_joao'
    },
    {
      id: 'cli_02',
      nome: 'Empresa Beta SA',
      nif: '5409876543LA099',
      bi: '009876543LA099',
      telefone: '+244 912 999 888',
      iban: 'AO06004000009876543210987',
      gestorContaId: 'outro_gestor_99'
    }
  ];

  const resultado = ServicoControloAcesso.filtrarClientesPorAmbito(bancoClientes, gestorComercial);

  // Deve ver apenas o seu cliente (escopo de carteira própria)
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].id, 'cli_01');

  // NIF deve estar estritamente mascarado (ex.: 0034****LA042 ou 5001****LA042)
  assert.match(resultado[0].nif, /^5001\*\*\*\*LA042$/);
  assert.notEqual(resultado[0].nif, '5001234567LA042', 'O NIF original não deve estar visível');

  // Telefone e IBAN também mascarados
  assert.match(resultado[0].telefone, /\*\*\*/);
  assert.match(resultado[0].iban, /\*\*\*\*/);

  // Utilizador com permissão de dados sensíveis vê os dados sem máscara
  const auditorComAcesso: Partial<User> = {
    id: 'auditor_01',
    role: 'auditor',
    dataScope: 'all',
    permissionExceptions: [
      {
        id: 'exc_01',
        permissionId: 'clientes.ver_sensiveis',
        tipo: 'conceder',
        motivo: 'Auditoria fiscal anual',
        atribuidoPor: 'admin',
        atribuidoEm: new Date().toISOString()
      }
    ]
  };

  const resultadoAuditor = ServicoControloAcesso.filtrarClientesPorAmbito(bancoClientes, auditorComAcesso);
  assert.equal(resultadoAuditor.length, 2);
  assert.equal(resultadoAuditor[0].nif, '5001234567LA042');
  assert.equal(resultadoAuditor[0].telefone, '+244 923 456 789');
});

test('7. Uma permissão temporária expira na data definida', () => {
  const agora = Date.now();
  const dataExpirada = new Date(agora - 1000 * 60 * 60).toISOString(); // Há 1 hora atrás
  const dataFutura = new Date(agora + 1000 * 60 * 60 * 24).toISOString(); // Daqui a 24 horas

  const analistaRisco: Partial<User> = {
    id: 'analista_temp',
    role: 'risk_analyst', // Perfil base não tem 'creditos.desembolsar'
    status: 'active',
    permissionExceptions: [
      {
        id: 'exc_expirada',
        permissionId: 'creditos.desembolsar',
        tipo: 'conceder',
        motivo: 'Substituição de férias concluída',
        atribuidoPor: 'super_admin',
        atribuidoEm: new Date(agora - 100000).toISOString(),
        dataExpiracao: dataExpirada // EXPIRADA
      },
      {
        id: 'exc_valida',
        permissionId: 'relatorios_financeiros.exportar',
        tipo: 'conceder',
        motivo: 'Apoio no fecho contabilístico',
        atribuidoPor: 'super_admin',
        atribuidoEm: new Date().toISOString(),
        dataExpiracao: dataFutura // VÁLIDA
      }
    ]
  };

  const efetivas = ServicoControloAcesso.calcularPermissoesEfetivas(analistaRisco);

  // A permissão expirada NÃO deve constar nas permissões efetivas
  assert.equal(
    efetivas.permissoes.includes('creditos.desembolsar'),
    false,
    'Permissão com data de expiração ultrapassada deve ser revogada automaticamente'
  );
  assert.equal(ServicoControloAcesso.temPermissao(analistaRisco, 'creditos.desembolsar'), false);

  // A permissão futura ativa DEVE constar
  assert.equal(
    efetivas.permissoes.includes('relatorios_financeiros.exportar'),
    true,
    'Permissão temporária dentro do prazo de validade deve estar ativa'
  );
  assert.equal(ServicoControloAcesso.temPermissao(analistaRisco, 'relatorios_financeiros.exportar'), true);
});

test('8. Todas as alterações acima aparecem na Auditoria com valores antes e depois (diff)', async () => {
  const executor: Partial<User> = {
    id: 'super_admin_01',
    name: 'Super Administrador Principal',
    role: 'super_admin'
  };

  const utilizadorAlvo: Partial<User> = {
    id: 'user_alvo_55',
    name: 'Sebastião Técnico',
    email: 'sebastiao@banco.ao',
    role: 'cashier'
  };

  const permissoesAntes = ['pagamentos.ver', 'pagamentos.criar'];
  const permissoesDepois = ['pagamentos.ver', 'pagamentos.criar', 'creditos.aprovar'];

  // Exigência de motivo obrigatório
  await assert.rejects(
    async () => {
      await ServicoControloAcesso.registarAlteracaoPermissoes({
        executor,
        alvo: utilizadorAlvo,
        motivo: '', // Vazio deve falhar
        permissoesAntes,
        permissoesDepois
      });
    },
    (err: any) => {
      assert.match(err.message, /justificação detalhada/);
      return true;
    }
  );

  // Registo com motivo válido
  const resultado = await ServicoControloAcesso.registarAlteracaoPermissoes({
    executor,
    alvo: utilizadorAlvo,
    motivo: 'Promoção temporária para comissão de crédito balcão Luanda',
    permissoesAntes,
    permissoesDepois,
    perfilAntes: 'cashier',
    perfilDepois: 'credit_manager'
  });

  assert.ok(resultado.logId);
  assert.ok(resultado.diff.length > 0);
  assert.match(resultado.diff[0], /\+ Concedida/);

  // Verificar que foi registado no histórico de auditoria
  const log = ServicoControloAcesso.historicoAuditoria.find(l => l.id === resultado.logId);
  assert.ok(log, 'Registo de auditoria deve existir no histórico');
  assert.equal(log?.executorId, 'super_admin_01');
  assert.equal(log?.alvoId, 'user_alvo_55');
  assert.equal(log?.estadoAnterior.perfil, 'cashier');
  assert.equal(log?.estadoNovo.perfil, 'credit_manager');
  assert.deepEqual(log?.estadoAnterior.permissoes, permissoesAntes);
  assert.deepEqual(log?.estadoNovo.permissoes, permissoesDepois);
});

test('9. Painel de Segurança e Rastreio de Sessões Ativas', () => {
  const sessoes = ServicoControloAcesso.obterSessoesDispositivos('usr_tester');
  assert.equal(sessoes.length, 5, 'Deve listar exatamente 5 sessões de dispositivos');

  // Deve haver uma sessão atual
  const atual = sessoes.find(s => s.isCurrent);
  assert.ok(atual, 'Deve haver uma sessão atual');

  // Deve haver uma sessão com alerta de localização invulgar
  const invulgar = sessoes.find(s => s.isUnusualLocation);
  assert.ok(invulgar, 'Deve existir uma sessão com destaque de localização invulgar');
  assert.match(invulgar?.unusualReason || '', /Localização invulgar/);

  // Terminar sessão específica
  const idParaTerminar = sessoes[1].id;
  ServicoControloAcesso.terminarSessaoDispositivo(idParaTerminar);
  const sessoesAposTerminar = ServicoControloAcesso.obterSessoesDispositivos('usr_tester');
  assert.equal(sessoesAposTerminar.some(s => s.id === idParaTerminar), false);

  // Terminar todas as outras sessões
  ServicoControloAcesso.terminarOutrasSessoes();
  const apenasSessaoAtual = ServicoControloAcesso.obterSessoesDispositivos('usr_tester');
  assert.equal(apenasSessaoAtual.length, 1);
  assert.equal(apenasSessaoAtual[0].isCurrent, true);
});
