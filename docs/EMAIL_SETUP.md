# Sistema de email Tango

## Estado nesta preparação

O repositório já tem `nodemailer`, mas o transporte existente é iniciado pelo Electron com configurações SMTP da interface. A fundação em `server/` é um transporte central reutilizável, desativado por omissão, com STARTTLS/TLS verificado, templates texto/HTML e resultados seguros. O `.env.example` contém apenas nomes e placeholders; não é uma configuração operacional.

Esta preparação não envia email e não liga ainda o novo serviço aos fluxos de autenticação. As contas e hashes de palavra-passe vivem na base SQLite local de cada instalação, enquanto o PostgreSQL central guarda tenants e pedidos pendentes de onboarding. A API central não consegue validar ou alterar de forma autoritativa as contas desktop/offline. O endpoint central de recuperação existente não atualiza a conta local. É necessária uma decisão de arquitetura antes de ligar notificações de login ou recuperação central.

O pedido de onboarding continua sujeito a aprovação manual. Verificar um endereço deve ser uma condição adicional do pedido, nunca uma aprovação comercial. A verificação de endereço ainda não está implementada nesta preparação.

## Variáveis

Usa `.env.example` apenas como referência. `MAIL_ENABLED=false` mantém o transporte desligado. A aplicação não usa transportes de teste como fallback. Para ativar posteriormente, configura os valores reais através do secret manager do runtime e só depois define `MAIL_ENABLED=true`.

`MAIL_QUEUE_ENABLED=true` é recusado: não existe fila nem worker no sistema atual. O envio preparado é síncrono e faz uma tentativa; não deve ser chamado em fluxos críticos até existir outbox/fila persistente, retries limitados e monitorização. Falha SMTP não deve bloquear login.

O serviço não imprime destinatário, corpo, token, password, credenciais SMTP ou mensagem original da exceção. O callback de auditoria recebe apenas tipo, estado, código seguro e timestamp; ainda não está ligado a uma tabela de auditoria persistente.

## SMTP

- A porta 587 usa STARTTLS obrigatório (`MAIL_ENCRYPTION=starttls`).
- A porta 465 usa TLS implícito (`MAIL_ENCRYPTION=tls`). `ssl` não é um valor aceite para a porta 587.
- A validação do certificado está sempre ativa, com TLS 1.2 mínimo. Não usar `rejectUnauthorized=false`.
- O domínio, caixas `suporte@` e `noreply@`, credenciais, certificado e entrega não foram validados. `noreply@` não deve ser apresentado como caixa funcional.
- O `verifyConnection()` do serviço permite um teste explícito após configurar o runtime; não foi executado contra um servidor SMTP real.

## DNS e VPS para a fase operacional

1. Confirmar com o fornecedor do VPS que o hostname `mail.tangogestaoecreditos.tech` resolve para o host correto e que as portas de envio necessárias estão disponíveis.
2. Configurar MX do domínio e PTR/reverse DNS com o fornecedor do VPS.
3. Criar um certificado TLS válido para o hostname SMTP e validar a cadeia apresentada.
4. Publicar SPF que preserve todas as origens autorizadas atuais; não substituir o registo existente sem inventariar remetentes.
5. Gerar DKIM no servidor real e publicar apenas a chave pública fornecida por essa configuração. Não reutilizar chaves de exemplo.
6. Começar DMARC em modo de observação, analisar relatórios e só depois endurecer a política.
7. Testar envio e receção para domínios externos de teste, TLS, SPF, DKIM, DMARC e bounces; isso não garante entrega/reputação futura.

## Integrações ainda necessárias

- Verificação de email para pedidos de empresa, com token hash de uso único e expiração; manter estado `pending` até verificação e aprovação separadas.
- Notificação de login: exige um evento autenticado emitido pelo processo principal após sessão/MFA completas, com consentimento/preferência e proteção contra spam. Não enviar do renderer e não confiar num `userId` fornecido pelo cliente.
- Recuperação: precisa de uma identidade autoritativa e de um mecanismo que alcance as contas SQLite offline. Não emitir token central que não possa alterar a conta real.
- Outbox persistente, limites, retenção, retries/backoff e comando de recuperação antes de ativar notificações assíncronas.
- O transporte local do Electron deve ser migrado separadamente para o backend central; não retirar a funcionalidade existente antes de migrar os consumidores de recibos, cobranças e relatórios.