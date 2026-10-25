# Hub de Cobrança — implementação de 25/10/2026

Implementa o documento `MELHORIAS_HUB_COBRANCA.md`. Rota existente: `#/hub-whatsapp`, com a permissão `manage_payments`.

## Operação

- **Visão geral:** valor recuperado após contacto no mês, créditos contactados com pagamento, mensagens realmente enviadas, promessas cumpridas/falhadas e faixas de antiguidade 1–30, 31–60, 61–90 e mais de 90 dias. Sem atrasos, apresenta os próximos vencimentos e campanhas.
- **A vencer:** prestações por vencer, incluindo o próprio dia, com a antecedência definida na régua. O valor é o remanescente de cada prestação; prestações pagas e canceladas não entram.
- **Em atraso:** prestações efectivamente vencidas, filtros por operador e antiguidade, selecção por página e botão de envio junto da lista.
- **Ficha:** linha do tempo de contactos, respostas, pagamentos, promessas, acordos e preferências. Regista chamadas com resultado e permite preparar WhatsApp, SMS ou e-mail. Abrir um link NÃO conta como mensagem enviada; o operador confirma o envio realizado. A API confirma os seus próprios estados por webhook.
- **Promessas:** valor e data, apuramento com pagamentos confirmados no prazo, lembrete da promessa e avanço comercial da régua em caso de falha. Uma promessa aberta por crédito; decisão final única e histórico imutável.
- **Propostas:** simulações de liquidação antecipada e renegociação usam os motores existentes. Não alteram o contrato; seguem os processos de análise e aprovação já existentes. Por omissão, o encaminhamento jurídico é uma tarefa a rever e justificar por quem tem permissão. A administração pode activar a criação automática de processos internos no passo jurídico; exige um utilizador com permissão de contencioso e não duplica processos abertos. Não envia intimações externas nem depende da contagem de aberturas do WhatsApp.
- **Equipa e metas:** atribuições por crédito, fila diária filtrável, metas por operador e equipa e cumprimento de promessas por operador.

## Régua

Definições por empresa: passos, antecedência, texto, tom, modelo Meta, horário de Angola, limite diário de contactos, frequência de promoções e dias adicionais sem expediente. Os passos iniciais são D-3, D-1, D0, D+1, D+7, D+15 e revisão jurídica em D+30.

O servidor recusa contactos fora do horário, fins de semana e feriados nacionais (o mesmo calendário do ERP). Um passo ultrapassado ou desactivado deixa de ser enviado. Uma promessa ainda em aberto suspende avisos gerais para o respectivo crédito.

## Campanhas

Rascunhos com datas, mensagem, anexo PNG/JPEG/PDF, ofertas por cliente e segmentos: histórico favorável, crédito liquidado recentemente, prestações em dia, inactividade, aniversariantes, província e balcão. A oferta respeita o crédito disponível do cadastro; não constitui aprovação de um novo crédito.

O aceite promocional é registado em **Editar cliente → Contacto e promoções**, com data, operador e referência da evidência; também pode ser actualizado na ficha do Hub. Sem aceite não há inclusão. O público exclui atrasados, saídas e contactos dentro do limite de frequência, valida números angolanos e elimina duplicados por telefone.

A pré-visualização da API usa o corpo efectivamente aprovado na Meta. Há teste para o número do operador, agendamento faseado, pausa/cancelamento da fila e resultados de envio, entrega, leitura, resposta, saída e pedidos de crédito atribuídos manualmente. Cada pedido de crédito só pode ser atribuído uma vez.

## Configurar a WhatsApp Business Platform

O canal fica **desligado por omissão**. Não foram configurados números nem credenciais reais e nenhum teste envia mensagens reais.

1. Obter conta/número dedicado, token, App Secret, ID da conta Business e ID do telefone na Meta.
2. Definir uma chave aleatória com pelo menos 32 caracteres em `WHATSAPP_ENCRYPTION_KEY` no `.env` da VPS. Fazer backup dessa chave: ela cifra as credenciais com AES-256-GCM. Não a colocar em variáveis `VITE_*`.
3. Activar o trabalhador com `WHATSAPP_WORKER_ENABLED=true` quando o canal estiver pronto; o Docker Compose passa estas variáveis à aplicação.
4. Preencher a ligação no Hub e confirmar o Código de Acesso da empresa. O servidor não devolve os segredos ao navegador e guardar uma ligação deixa os envios desligados.
5. Registar na Meta a URL apresentada, `/api/whatsapp-webhook?empresa=<identificador>`, com o mesmo token de verificação, e subscrever `messages`.
6. Criar e aprovar modelos **UTILITY** para cobrança e **MARKETING** para campanhas. Configurar a versão Graph API indicada pela própria aplicação Meta. Associar os modelos no Hub.
7. Os modelos de cobrança suportados usam 4 parâmetros de corpo, nesta ordem: **nome, valor da prestação, vencimento, dados de pagamento**. Os promocionais usam **nome, limite da oferta, taxa, validade** e incluem a instrução de responder **SAIR**. Suportam cabeçalho de imagem ou documento, com o anexo importado pela mesma empresa. A nota PDF é gerada e anexada quando o modelo UTILITY exige DOCUMENT.
8. Agendar um teste para o próprio número e só depois activar os envios reais e a preparação automática desejada.

Referências técnicas: [API oficial da Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/), [verificação de webhooks](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/).

## Fila, actualidade dos dados e segurança

- A fila, estados, quotas e saídas são persistidos no PostgreSQL e separados por empresa. As credenciais ficam cifradas, separadas dos dados enviados ao navegador.
- No desktop e na web, o Hub publica apenas os dados necessários ao envio: telefone, valores e identificadores das prestações, promessas e estado de consentimento. O trabalhador só envia com dados actualizados há menos de **15 minutos**. Sem uma aplicação ligada a actualizar a carteira, a fila aguarda; não envia uma cobrança baseada numa cópia financeira antiga.
- Antes de enviar, revalida licença, horário, prestação ainda em aberto, telefone, promessa, consentimento, saída, campanha e frequência. O valor é recalculado a partir da última fotografia recebida.
- Uma quota transaccional por telefone e dia e uma reserva promocional por telefone impedem concorrência entre operadores/processos. A fila tem identificadores estáveis e reserva cada trabalho com `FOR UPDATE SKIP LOCKED`.
- Um timeout depois de iniciar o pedido à Meta deixa o estado **incerto**, sem repetição automática. Confirmar na Meta antes de um novo envio.
- Os webhooks verificam HMAC-SHA256 sobre os bytes originais e os identificadores da conta e telefone. Eventos repetidos não duplicam contactos; estados fora de ordem não transformam uma mensagem lida em apenas enviada. SAIR bloqueia os trabalhos promocionais ainda na fila, mesmo que existam cadastros com o mesmo número.
- A Vercel recebe o webhook numa função separada, com `bodyParser: false`; a VPS conserva `rawBody` antes de analisar JSON. O trabalhador contínuo é da VPS; um alojamento sem processo persistente exige um agendador externo para chamar o processamento.
- SMS e e-mail são alternativas manuais nesta implementação. Não foi contratado ou activado qualquer fornecedor SMS, Twilio ou 360dialog.

## Dados e validação

Novas tabelas locais `hub_collection_*` entram no arranque SQLite e na lista branca SQL do Electron. Reutilizam-se `collection_events`, o plano de prestações, scoring, pagamentos e motores de simulação existentes. As preferências, campanhas e eventos sincronizam com os mecanismos já existentes. O histórico antigo permanece visível como registo sem entrega verificada.

Testes específicos: `tests/hub-cobranca.test.mjs`. Ensaio visual sem fornecedores externos: `node --test tests/hub-cobranca.browser.mjs` (Chromium do Puppeteer).

## Publicação e verificações

Publicado na VPS em 25/10/2026, sobre as fontes que estavam activas, preservando as correcções anteriores do editor de cartas e do carregamento.

- **455 testes aprovados**, zero falhas e zero testes ignorados: ficheiros de teste versionados do projecto e o novo teste do Hub. Execução em contentor Linux/Node 22 isolado, sem rede e sem volumes de produção.
- ESLint: zero erros e 28 avisos. Os três projectos TypeScript passaram. Compilações web e Electron concluídas.
- Ensaio Chromium aprovado: listas preventiva e vencida, ficha, registo de promessa, público/pré-visualização/gravação de campanha, canal desligado e apresentação móvel. Sem pedidos à Meta.
- O teste experimental **não versionado** `tests/tenant-auth.test.mjs`, já existente na VPS, foi preservado. A execução inicial com todos os ficheiros encontrou uma falha nesse teste, que importa uma função inexistente e pressupõe outra política de autenticação. Não integra a bateria oficial acima; a autenticação existente não foi alterada para o satisfazer.
- Aplicação e PostgreSQL saudáveis após a publicação; `/api/cobranca` sem autenticação devolve 401. O trabalhador WhatsApp está desligado e a chave de cifra não está configurada.
- SHA-256 do HTML público, igual ao do contentor: `aa3a32b53944dce8be330d56982fa3185d00bf0817023e84f4ae4ea0466d2d7f`.
- Imagem publicada: `sha256:33a06708c0b0b1994d85c6418348424860284b214870a6e32badf30d39af751d`.

Cópias de recuperação e registos: `/var/backups/tango/hub-cobranca-20261025/`. Imagem anterior: `tango-erp-app:antes-hub-cobranca-20261025`. Nenhuma mensagem real foi enviada. A configuração Meta, a aprovação dos modelos e o ensaio real do canal continuam pendentes até a empresa obter a conta.
