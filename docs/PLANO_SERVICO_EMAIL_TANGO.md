# Plano técnico do serviço central de e-mail do Tango ERP

## Objetivo

Implementar um serviço central de e-mail reutilizável, seguro e auditável, sem activar SMTP em produção antes da validação final do domínio, DNS, TLS e reputação do IP.

## Restrições de segurança

- `MAIL_ENABLED` deve permanecer `false` até que o ambiente de infraestrutura esteja validado.
- Nunca se devem registar tokens, senhas, chaves ou segredos em logs.
- O código deve separar sempre a composição da mensagem do transporte SMTP.
- Não deve existir sucesso assumido quando o envio falha.
- A verificação do e-mail deve continuar separada da aprovação administrativa e da ativação da empresa.

## Arquitetura recomendada

1. Módulo central de e-mail
   - Reutilizar `nodemailer` já declarado em `package.json`.
   - Manter um único serviço que recebe: destinatário, assunto, texto e HTML, tipo de template, dados do contexto.
   - Expor uma função de transporte `sendTransactionalMail` e outra `createTransportOptions` para facilitar testes.

2. Transporte
   - Ler tudo a partir de variáveis de ambiente.
   - Sem enviar quando `MAIL_ENABLED` for `false`.
   - Se o transporte falhar, devolver status explícito e não tratar como sucesso.

3. Templates
   - Cada tipo de mensagem deve ter um template texto e HTML dedicados.
   - Não incluir tokens permanentes nem credenciais.
   - Usar URLs HTTPS do domínio oficial confirmado.

4. Auditoria
   - Registar apenas referência do evento, destinatário mascarado, tipo de mensagem, status e timestamp.
   - Nunca gravar token em claro nem link secreto completo.

## Variáveis esperadas

- `MAIL_ENABLED=false`
- `MAIL_HOST`
- `MAIL_PORT`
- `MAIL_USERNAME`
- `MAIL_PASSWORD`
- `MAIL_FROM_ADDRESS`
- `MAIL_ENCRYPTION`
- `APP_URL`
- `TANGO_MASTERGEN_URL`

## Tipos de mensagens a cobrir

- verificação de e-mail da empresa
- confirmação de pedido de registo
- aprovação/rejeição administrativa
- login recente / alerta de segurança
- recuperação de palavra-passe
- alteração de palavra-passe
- alteração de e-mail
- avisos administrativos e de segurança

## Validação necessária antes de activação

- DNS e MX válidos no domínio real.
- SPF, DKIM e DMARC validados.
- PTR/rDNS do IP verificado.
- TLS de SMTP em funcionamento.
- reputação do servidor e IP acorde com a entrega.
- testes em ambiente isolado, com dados descartáveis.

## Estado atual

- O backend de verificação de e-mail já está funcional em lógica e testes unitários.
- O envio SMTP continua desativado e não foi validado em produção.
- Ainda não existe ambiente isolado com PostgreSQL e SMTP para validação real.
- A implementação final deve aguardar autorização explícita antes de qualquer mudança de produção.
