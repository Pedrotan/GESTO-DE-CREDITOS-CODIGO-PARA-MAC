# Modo Servidor: plataforma e licença

- O interruptor e as instruções de servidor local são apresentados no desktop quando a licença válida permite `intranet`. `multi_empresa` é uma funcionalidade independente e não concede intranet automaticamente. Uma definição explícita `intranet: false` prevalece sobre o escalão empresarial.
- Na versão web, o cartão explica que a sincronização é feita através da VPS, sem interruptor para iniciar um servidor local. O campo de endereço apresenta a nuvem em vez de sugerir um IP da rede local.
- As operações do contexto de dados recusam iniciar/promover um servidor na web, antes de alterar o estado local ou mostrar sucesso. No desktop voltam a validar a licença antes de chamar o IPC.
- O processo principal verifica os módulos do token cloud validado e, quando aplicável, a assinatura e validade da licença RSA antiga. A verificação e o comprimento mínimo da chave da rede ficam no ponto comum usado tanto por `start-server` como por `promote-to-master`.
- A licença RSA efetiva pode ser enviada pelo preload para manter compatibilidade com licenças globais antigas; a assinatura é verificada no processo principal e nenhum booleano de permissão vindo do renderer é aceite.
- Se já existir um servidor em execução e o direito deixar de estar disponível, o controlo permanece acessível para o administrador o desligar. A ativação continua bloqueada.

Validação: 29 testes de regras de intranet, licenciamento e sincronização passaram; verificação TypeScript completa e compilações web/Electron realizadas. Os testes incluem intranet explícita em plano singular, recusa explícita em empresarial, licença inválida, web, licenças RSA antigas, expiração e preferência de licença durante a demonstração.

Publicação web em `/root/tango-erp`, backup em `/root/tango-intranet-backup-20261018/anterior.tgz`. Os hashes dos ficheiros existentes foram comparados antes da alteração. Os assets foram publicados antes do HTML, e o domínio HTTPS confirmou o mesmo hash do HTML e a API saudável, sem reinício da base de dados.

Instalador Windows: `release/servidor-local-corrigido/TangoGestaoCreditos_Setup.exe`. Atualizar a página web e fechar o desktop antes de instalar.
