# Plano de Implementação — Tango Gestão de Créditos

## 1. Objetivo

Evoluir o sistema atual de MVP funcionalmente rico para uma plataforma financeira segura, auditável, profissional, escalável e preparada para operação multiempresa.

Este plano cobre:

- correções críticas de segurança;
- proteção e consistência dos dados financeiros;
- recuperação de desastre e backups;
- qualidade de código e testes;
- melhoria visual e de experiência do utilizador;
- desempenho e modularização;
- arquitetura cloud e multi-tenant;
- novas funcionalidades de negócio;
- observabilidade, implantação e operação.

Horizonte recomendado: 24 a 32 semanas, executado de forma incremental. As fases 0, 1 e 2 são bloqueadoras para uma utilização segura em produção.

---

## 2. Princípios de execução

1. Segurança e integridade financeira têm prioridade sobre novas funcionalidades.
2. Nenhuma chave privada ou segredo deve existir no frontend, instalador ou repositório.
3. Toda operação financeira deve ser atómica, idempotente e auditável.
4. Permissões devem ser aplicadas no backend/processo principal, nunca apenas na interface.
5. Alterações de base de dados devem usar migrações versionadas e reversíveis.
6. Cada fase deve ser entregue atrás de feature flags quando houver risco operacional.
7. Nenhuma versão segue para produção sem testes, backup e plano de rollback.
8. O Electron continuará a poder trabalhar offline, mas o servidor será a autoridade em ambientes multiempresa.

---

## 3. Estrutura da equipa recomendada

| Papel | Responsabilidades principais |
|---|---|
| Tech Lead/Arquiteto | Arquitetura, decisões técnicas, revisão e coordenação |
| Engenheiro Backend/Security | Autenticação, autorização, APIs, chaves, cloud e segurança |
| Engenheiro Frontend/Electron | UI, Electron, preload/IPC, desempenho e acessibilidade |
| Engenheiro de Dados/Financeiro | Ledger, prestações, reconciliação e regras contabilísticas |
| QA/Automação | Estratégia de testes, regressão, E2E e testes de restauração |
| DevOps/SRE | CI/CD, ambientes, observabilidade, releases e recuperação |
| Product Owner/Especialista de Crédito | Validação das regras e critérios de negócio |
| UX/UI Designer | Design system, fluxos, protótipos e usabilidade |

Para uma equipa pequena, os papéis podem ser acumulados, mas Security, QA e validação financeira não devem depender exclusivamente da pessoa que escreveu a funcionalidade.

---

## 4. Fases e cronograma

## Fase 0 — Contenção e preparação

**Duração:** 3 a 5 dias  
**Prioridade:** P0  
**Objetivo:** impedir novas exposições e criar uma base segura para as alterações.

### Atividades

- Criar um repositório Git funcional e preservar uma cópia imutável do estado atual.
- Definir branches protegidas e política de pull request.
- Inventariar instaladores e builds já distribuídos.
- Inventariar chaves, tokens, credenciais e ficheiros `.env` existentes.
- Rodar imediatamente credenciais que possam ter sido partilhadas.
- Remover artefactos AppleDouble `._*` e impedir que regressem pelo `.gitignore`.
- Retirar builds, releases, ZIPs, bases e ficheiros secretos do repositório.
- Escolher um gestor de segredos para desenvolvimento e produção.
- Congelar novas funcionalidades até concluir os P0.
- Fazer cópia offline verificada das bases reais antes de alterar migrações.

### Entregáveis

- Repositório Git limpo e recuperável.
- Inventário de segredos e matriz de rotação.
- Lista de builds afetados e plano de atualização obrigatória.
- Ambientes separados: desenvolvimento, homologação e produção.

### Critérios de aceitação

- Nenhum segredo aparece no repositório ou nos instaladores.
- Todo segredo potencialmente exposto foi revogado e substituído.
- Existe uma cópia testada do estado atual para rollback.

---

## Fase 1 — Segurança crítica e fronteiras de confiança

**Duração:** 2 a 3 semanas  
**Prioridade:** P0  
**Objetivo:** corrigir autenticação, licenciamento, IPC e comunicações inseguras.

### 1.1 Autenticação e sessões

- Remover senha Master padrão e tokens de recuperação previsíveis.
- Remover autenticação baseada em booleano no `localStorage`.
- Implementar autenticação Master no processo principal ou backend.
- Armazenar passwords com Argon2id ou bcrypt assíncrono com custo revisto.
- Criar sessões assinadas, com expiração absoluta e por inatividade.
- Vincular a sessão a um identificador de dispositivo e permitir revogação.
- Revalidar a sessão ao abrir a aplicação; nunca confiar no utilizador guardado no `sessionStorage`.
- Bloquear enumeração de utilizadores e aplicar rate limit progressivo.
- Rever o lockout para evitar bloqueio malicioso de contas.
- Validar e limitar `returnUrl` a rotas internas conhecidas.

### 1.2 MFA/2FA

- Tornar MFA obrigatório para Master e super administradores.
- Eliminar o bypass de 2FA na reautenticação rápida.
- Cifrar os segredos TOTP com uma chave protegida pelo sistema operacional.
- Nunca guardar o segredo TOTP no objeto de sessão do frontend.
- Criar códigos de recuperação de uso único, armazenados como hash.
- Implementar proteção contra repetição do mesmo código TOTP.
- Auditar ativação, desativação e recuperação do MFA.

### 1.3 Licenciamento e chaves criptográficas

- Remover todas as chaves privadas do dashboard, raiz e pacote administrativo.
- Eliminar bypasses de máquina e o formato de licença legada forjável.
- Rodar o par de chaves de licenciamento.
- Implementar serviço de assinatura isolado; apenas a chave pública permanece no cliente.
- Guardar a chave privada em KMS/HSM ou secret store com controlo de acesso.
- Adicionar `kid`, versão do algoritmo, `iat`, `exp`, `jti` e versão de licença ao payload.
- Implementar revogação de licenças e lista de dispositivos autorizados.
- Assinar canonicamente o payload e validar todos os campos antes de aceitar a licença.

### 1.4 Segurança Electron e IPC

- Manter `contextIsolation: true`, `nodeIntegration: false` e `webSecurity: true`.
- Ativar sandbox em todos os sistemas suportados.
- Remover `no-sandbox` e documentar exceções realmente inevitáveis.
- Desativar plugins quando não forem necessários.
- Trocar APIs genéricas de SQL por comandos de domínio tipados.
- Aplicar `assertTrustedIpcSender` em todos os handlers IPC.
- Aplicar autenticação e autorização em cada comando privilegiado.
- Limitar tamanhos e formatos de email, PDF, imagem, importação e configuração.
- Validar URLs e bloquear SSRF em `fetch-server-config` e integrações.
- Bloquear leitura/gravação de chaves privadas via renderer.
- Exigir confirmação reforçada para reset nuclear, importação e eliminação de contas.

### 1.5 XSS e conteúdo ativo

- Adicionar Content Security Policy restritiva no Electron e web.
- Remover ou sanitizar todo `dangerouslySetInnerHTML` com uma biblioteca atualizada e configuração fixa.
- Aplicar Trusted Types onde suportado.
- Sanitizar cartas, templates e HTML antes de guardar e antes de apresentar.
- Impedir scripts, handlers `on*`, URLs `javascript:`, iframes e SVG ativo.
- Remover manipulações diretas de `innerHTML` quando houver alternativa React.

### 1.6 TLS, rede e privacidade

- Remover `rejectUnauthorized: false` e configuração SSLv3 do SMTP.
- Exigir TLS moderno e certificados válidos.
- Tornar a passkey obrigatória no servidor LAN.
- Autenticar SSE, configuração e sincronização.
- Usar HTTPS/mTLS ou túnel seguro para sincronização fora do localhost.
- Restringir CORS a origens explicitamente permitidas.
- Aplicar rate limiting distribuído nas APIs públicas.
- Proteger o lookup de BI/NIF com autenticação, quota e auditoria.
- Remover endpoints HTTP de terceiros.
- Criar consentimento e política de retenção para dados de BI/NIF.
- Minimizar dados pessoais em logs, relatórios e notificações.

### Critérios de aceitação da Fase 1

- Alterar `localStorage` ou `sessionStorage` não concede acesso.
- Nenhuma chave privada existe no cliente ou instalador.
- Um renderer comprometido não consegue executar SQL arbitrário.
- MFA não pode ser contornado por reautenticação.
- Todas as ligações externas críticas validam TLS.
- Testes de XSS e autorização passam.
- Threat model e checklist OWASP ASVS/Electron estão documentados.

---

## Fase 2 — Integridade financeira, base de dados e backups

**Duração:** 3 a 5 semanas  
**Prioridade:** P0/P1  
**Objetivo:** garantir que saldos, pagamentos e backups são corretos e recuperáveis.

### 2.1 Ledger financeiro

- Criar ledger imutável de dupla entrada como fonte de verdade.
- Guardar dinheiro em unidades mínimas inteiras ou decimal exato; eliminar `REAL` para montantes.
- Proibir edição e eliminação direta de lançamentos contabilísticos.
- Corrigir erros por meio de estorno e lançamento compensatório.
- Incluir utilizador, dispositivo, motivo, timestamp e correlação em cada movimento.
- Assinar/encadear registos de auditoria e validar periodicamente a integridade.

### 2.2 Motor de crédito e prestações

- Criar cronograma de prestações por crédito.
- Separar capital, juro normal, juro de mora, taxas e penalizações.
- Definir ordem configurável de alocação de pagamentos.
- Suportar pagamento parcial, excedente, liquidação antecipada e pagamento retroativo.
- Recalcular saldo a partir do ledger, não de contadores mutáveis.
- Atualizar `paidInstallments` apenas conforme o cronograma liquidado.
- Adicionar regras para reforço de capital, refinanciamento e renegociação.
- Criar invariantes: saldo nunca negativo, alocações somam o pagamento e totais fecham.

### 2.3 Transações e idempotência

- Executar pagamento + ledger + crédito + contrato + auditoria numa única transação.
- Fazer o mesmo para aprovação, rejeição, estorno, reforço, write-off e restauração.
- Adicionar chave idempotente a operações financeiras e integrações.
- Aplicar controlo de concorrência otimista com campo `version`.
- Validar permissões e limites dentro da mesma transação.
- Evitar `ON DELETE CASCADE` em registos financeiros que precisam ser preservados.

### 2.4 Migrações e integridade da base

- Adotar ferramenta/padrão de migrações versionadas.
- Remover criação de tabelas e alterações de schema dos contextos React.
- Consolidar definições duplicadas de schema.
- Adicionar `CHECK` para montantes, taxas, datas e estados válidos.
- Adicionar foreign keys em contratos, ledger, garantias e contencioso.
- Criar testes de migração para bases provenientes de todas as versões suportadas.
- Falhar de forma segura quando uma base não abre; nunca criar uma base vazia silenciosamente.

### 2.5 Backups e recuperação de desastre

- Corrigir e tipar `backupDatabase` no preload.
- Fazer o handler devolver o resultado real, checksum, tamanho e localização.
- Na web, exportar realmente o ficheiro ou enviar backup cifrado a armazenamento seguro.
- Criar formato de backup versionado com manifesto e checksum.
- Usar chave aleatória de backup, protegida por chave de recuperação, e não apenas pelo hardware.
- Criar fluxo de restauração para backups automáticos cifrados.
- Validar integridade antes de substituir a base ativa.
- Manter política 3-2-1: três cópias, dois meios, uma fora do dispositivo.
- Testar restauração automaticamente e fazer exercício mensal de desastre.
- Informar claramente quando o backup falha; proibir falsos sucessos.
- Rever `deleteAppDataOnUninstall` para impedir perda acidental.

### Critérios de aceitação da Fase 2

- Interromper uma operação financeira a meio não deixa alterações parciais.
- Ledger, crédito e caixa reconciliam em todos os testes.
- Backups restauram numa máquina diferente usando chave de recuperação.
- Nenhum sucesso de backup é apresentado sem ficheiro, checksum e verificação.
- Migrações antigas são testadas e reversíveis.

---

## Fase 3 — Qualidade de engenharia e testes

**Duração:** 3 a 4 semanas iniciais; depois contínua  
**Prioridade:** P1

### 3.1 Baseline de qualidade

- Corrigir os 63 erros e 40 avisos atuais do lint.
- Corrigir os erros TypeScript atuais.
- Ativar `strict` por módulos até atingir todo o projeto.
- Eliminar gradualmente `any` e `@ts-ignore`.
- Substituir `console.*` por logger estruturado com níveis e redaction.
- Remover ficheiros de backup, artefactos gerados e código morto.
- Padronizar UTF-8 e corrigir mojibake.
- Escolher um único gestor de pacotes e lockfile.

### 3.2 Estratégia de testes

- Unitários: cálculo de juros, mora, prestações, limites, scoring e licenças.
- Testes de propriedades: invariantes financeiras e arredondamento.
- Integração: repositórios, migrações, transações e sincronização.
- Componentes: formulários, permissões, validações e estados de erro.
- E2E web: login, cliente, crédito, aprovação, pagamento, estorno e relatórios.
- E2E Electron: IPC, importação, exportação, impressão, backup e recuperação.
- Segurança: autorização, XSS, SSRF, path traversal e abuso de APIs.
- Performance: carteiras com 10 mil, 100 mil e 1 milhão de movimentos.
- Recuperação: corrupção, falha de disco, perda de rede e conflito de sincronização.

### 3.3 CI/CD

- Pipeline em cada pull request: format, lint, tipos, testes, build e audit.
- Bloquear merge quando um gate falha.
- Adicionar secret scanning, SAST e análise de dependências.
- Gerar SBOM e assinar artefactos.
- Automatizar builds reproduzíveis para Windows e macOS.
- Criar canal alpha, beta e stable.
- Publicar release notes e scripts de migração.
- Implementar rollback da aplicação e compatibilidade de schema.

### Metas de qualidade

- Zero erro de lint e TypeScript.
- Cobertura mínima inicial: 70% no domínio financeiro e 50% global.
- 100% dos fluxos P0 cobertos por integração/E2E.
- Nenhuma vulnerabilidade crítica ou alta aceite sem exceção documentada.

---

## Fase 4 — Modularização, desempenho e manutenção

**Duração:** 4 a 6 semanas  
**Prioridade:** P1

### 4.1 Monólito modular

Organizar por domínios:

```text
src/
  modules/
    identity/
    customers/
    lending/
    payments/
    accounting/
    collections/
    legal/
    reporting/
    licensing/
  shared/
  infrastructure/
  app/
```

- Separar entidades, casos de uso, portas, adaptadores e UI.
- Dividir `ContextoDados` em stores/queries por domínio.
- Quebrar páginas acima de 500 linhas em componentes e hooks testáveis.
- Remover regras financeiras de componentes React.
- Definir DTOs e schemas Zod em todas as fronteiras.
- Criar tratamento central de erros e códigos de erro estáveis.

### 4.2 Desempenho

- Implementar paginação no banco para clientes, créditos, pagamentos e logs.
- Usar virtualização para tabelas extensas.
- Selecionar apenas colunas necessárias; reduzir `SELECT *`.
- Criar filtros e ordenação no banco.
- Rever índices com dados reais e `EXPLAIN QUERY PLAN`.
- Evitar carregar toda a carteira no arranque.
- Usar cache de queries e invalidação granular.
- Mover PDF, Excel, scoring pesado e relatórios para workers/jobs.
- Na web, substituir exportação integral do `sql.js` por OPFS/SQLite WASM adequado ou backend.
- Definir orçamento de bundle e lazy loading por módulo.

### Critérios de aceitação

- Arranque com 100 mil registos dentro do SLO definido.
- Alterar um pagamento não renderiza toda a aplicação.
- Tabelas mantêm interação fluida com grandes volumes.
- Domínio financeiro funciona sem dependência de React.

---

## Fase 5 — Experiência profissional e acessibilidade

**Duração:** 3 a 5 semanas, paralela à Fase 4  
**Prioridade:** P1/P2

### 5.1 Design system

- Definir uma identidade única entre tema claro e escuro.
- Criar tokens oficiais de cor, tipografia, espaçamento, raio, sombra e movimento.
- Hospedar fontes localmente para funcionamento offline.
- Documentar componentes e padrões num catálogo visual.
- Padronizar botões, formulários, modais, toasts, cards, filtros e tabelas.
- Reduzir animações e efeitos que dificultam tarefas financeiras.

### 5.2 Navegação e produtividade

- Reorganizar menu por Clientes, Crédito, Cobrança, Financeiro e Administração.
- Criar dashboard específico por função.
- Adicionar pesquisa global por cliente, BI/NIF, crédito, pagamento e contrato.
- Adicionar command palette e atalhos de teclado.
- Implementar breadcrumbs, ações recentes e favoritos.
- Preservar filtros e estado das páginas ao navegar.

### 5.3 Estados e comunicação

- Padronizar loading, skeleton, vazio, erro, offline e sincronização.
- Mostrar estado real de backup e última restauração testada.
- Exibir estado de sincronização e conflitos de forma compreensível.
- Melhorar mensagens de erro com ação recomendada e código de suporte.
- Criar confirmações reforçadas para ações financeiras irreversíveis.

### 5.4 Acessibilidade e localização

- Cumprir WCAG 2.2 AA.
- Garantir navegação completa por teclado e foco visível.
- Rever contraste, leitores de ecrã e áreas clicáveis.
- Respeitar `prefers-reduced-motion` globalmente.
- Padronizar português de Angola e terminologia financeira.
- Formatar moeda, números, datas e fusos de forma centralizada.

### Critérios de aceitação

- Testes de usabilidade com utilizadores dos principais perfis.
- Fluxos críticos completos sem rato.
- Zero erro grave em auditoria automatizada de acessibilidade.
- Linguagem, cores e componentes consistentes em todos os módulos.

---

## Fase 6 — Backend cloud, multi-tenant e sincronização

**Duração:** 6 a 8 semanas  
**Prioridade:** P1 para escala/multiempresa

### 6.1 Backend central

- Criar API versionada e autenticada.
- Usar PostgreSQL como fonte de verdade cloud.
- Implementar tenant explícito em todas as tabelas e queries.
- Aplicar Row-Level Security ou camada de isolamento equivalente.
- Separar utilizadores, empresas, filiais, equipas e carteiras.
- Manter auditoria de acesso entre tenants.
- Criar object storage cifrado para documentos.

### 6.2 Sincronização offline-first

- Parar de sincronizar SQL bruto.
- Sincronizar comandos/eventos de domínio versionados.
- Incluir `entityId`, `tenantId`, versão, origem e timestamp lógico.
- Usar outbox/inbox, idempotência e ordenação por servidor.
- Implementar tombstones para eliminações.
- Definir resolução de conflitos por tipo de entidade.
- Impedir conflito automático em pagamentos e ledger; exigir revisão.
- Criar snapshots e compactação do log.
- Definir retenção e limpeza das operações antigas.
- Processar lotes numa transação, evitando um insert remoto por operação.

### 6.3 Jobs e escala

- Adicionar fila para emails, WhatsApp, PDFs, relatórios e notificações.
- Usar retries exponenciais e dead-letter queue.
- Criar scheduler distribuído para cobrança e backups.
- Adicionar cache somente onde houver benefício medido.
- Implementar rate limiting por tenant, utilizador e IP.

### Critérios de aceitação

- Teste prova que um tenant nunca lê ou altera dados de outro.
- Dois dispositivos offline podem sincronizar sem corromper dados.
- Operações repetidas não geram pagamentos duplicados.
- Conflitos financeiros são bloqueados e apresentados para decisão.
- O log de sincronização possui retenção, compactação e métricas.

---

## Fase 7 — Novas funcionalidades de negócio

**Duração:** contínua após as fundações  
**Prioridade:** P2

### 7.1 Crédito e risco

- Cronograma completo de amortização Price/SAC e modalidades locais.
- Simulação comparativa e proposta antes da contratação.
- Reforço, refinanciamento, renegociação e liquidação antecipada.
- Scoring versionado e explicável.
- Políticas de crédito configuráveis por produto e perfil.
- Limites por operador, filial, produto e período.
- Indicadores PAR30, PAR60, PAR90, vintage e concentração.
- Provisão/ECL conforme política contabilística validada.

### 7.2 Aprovações e controlo

- Maker-checker: criador não aprova a própria operação.
- Aprovação multinível por valor, risco e exceção.
- Dupla aprovação para estorno, write-off e mudança de taxa.
- Caixa de trabalho com SLA, prioridade e escalonamento.
- Assinatura da decisão e justificação obrigatória.

### 7.3 Cobrança

- Régua de cobrança configurável.
- Promessas de pagamento com acompanhamento.
- Segmentação por dias em atraso, risco e valor.
- Templates aprovados e histórico omnicanal.
- Atribuição de carteira a cobradores.
- Visitas, acordos e evidências de contacto.
- Encaminhamento controlado para contencioso.

### 7.4 Tesouraria e contabilidade

- Fecho diário de caixa.
- Reconciliação bancária e de gateways.
- Plano de contas configurável.
- Períodos contabilísticos bloqueáveis.
- Estornos e ajustes com trilho completo.
- Exportação contabilística padronizada.

### 7.5 Documentos e portal

- Gestão documental com classificação, validade e retenção.
- Assinatura eletrónica e evidência de consentimento.
- Portal do cliente para extrato, recibos, prestações e pedidos.
- Upload seguro de comprovativos.
- Notificações configuráveis por email, SMS e WhatsApp.

### 7.6 Integrações

- API pública com OAuth2/client credentials.
- Webhooks assinados e idempotentes.
- Integração com bancos e gateways.
- Importação de extratos e reconciliação automática.
- Integração fiscal e contabilística conforme requisitos aplicáveis.

---

## Fase 8 — Produção, observabilidade e operação contínua

**Duração:** 2 a 3 semanas iniciais; depois contínua  
**Prioridade:** P1

### Observabilidade

- Logs JSON estruturados com correlation ID e tenant ID.
- Redaction automática de passwords, tokens, BI/NIF e dados bancários.
- Métricas de login, latência, erros, sincronização, jobs e backups.
- Tracing entre cliente, API, jobs e base.
- Alertas para falha de backup, divergência financeira e aumento de erros.
- Dashboard operacional e página de saúde.

### Releases e assinatura

- Assinar executáveis Windows.
- Ativar hardened runtime e notarização no macOS.
- Remover configurações de bypass do Gatekeeper.
- Implementar atualização automática assinada com rollback.
- Usar feature flags para mudanças de alto risco.
- Criar política de versões e suporte.

### Operação

- Runbooks para incidente, indisponibilidade, corrupção e recuperação.
- Plano de resposta a incidentes e comunicação.
- Matriz de retenção e eliminação de dados pessoais.
- Revisão trimestral de permissões.
- Pentest antes do go-live multiempresa e após grandes mudanças.
- Exercício semestral de desastre e restauração completa.

---

## 5. Backlog consolidado e prioridade

| ID | Entrega | Prioridade | Dependência |
|---|---|---:|---|
| SEC-01 | Remover autenticação Master do localStorage | P0 | Fase 0 |
| SEC-02 | Remover/rodar chaves privadas | P0 | Fase 0 |
| SEC-03 | Autorizar comandos no main/backend | P0 | SEC-01 |
| SEC-04 | Corrigir MFA e sessões | P0 | SEC-01 |
| SEC-05 | CSP, sanitização e Trusted Types | P0 | SEC-03 |
| SEC-06 | TLS, CORS, rate limit e SSRF | P0 | Fase 0 |
| DATA-01 | Backup real e restauração portátil | P0 | Fase 0 |
| DATA-02 | Ledger em dupla entrada | P0 | Migrações |
| DATA-03 | Transações financeiras atómicas | P0 | DATA-02 |
| DATA-04 | Dinheiro em inteiro/decimal | P0 | Migrações |
| DATA-05 | Motor de prestações | P1 | DATA-02 |
| ENG-01 | Corrigir lint e TypeScript | P1 | Fase 0 |
| ENG-02 | Testes financeiros e E2E | P1 | DATA-02 |
| ENG-03 | CI/CD e supply chain | P1 | ENG-01 |
| ENG-04 | Migrações versionadas | P1 | Fase 0 |
| ARCH-01 | Dividir ContextoDados | P1 | ENG-02 |
| ARCH-02 | Modularizar páginas grandes | P1 | ENG-01 |
| PERF-01 | Paginação e queries incrementais | P1 | ARCH-01 |
| UX-01 | Design system e identidade | P1 | Auditoria UX |
| UX-02 | Estados, pesquisa e navegação | P2 | UX-01 |
| CLOUD-01 | API e PostgreSQL multi-tenant | P1 | SEC/DATA |
| CLOUD-02 | Sincronização por eventos | P1 | CLOUD-01 |
| OPS-01 | Logs, métricas, alertas e tracing | P1 | CLOUD-01 |
| OPS-02 | Assinatura e atualização segura | P1 | ENG-03 |
| BIZ-01 | Maker-checker multinível | P1 | SEC/DATA |
| BIZ-02 | Cobrança e promessas de pagamento | P2 | DATA-05 |
| BIZ-03 | Reconciliação e fecho de caixa | P1 | DATA-02 |
| BIZ-04 | Portal do cliente | P2 | CLOUD-01 |

---

## 6. Estratégia de entrega e migração

1. Criar base sanitizada de homologação, nunca usar dados pessoais reais sem mascaramento.
2. Implementar testes de caracterização antes de refatorar regras existentes.
3. Introduzir ledger em paralelo e comparar os resultados com o modelo atual.
4. Corrigir divergências antes de tornar o ledger a fonte oficial.
5. Migrar dados por lotes com relatório de reconciliação.
6. Fazer piloto interno com uma cópia da base.
7. Liberar para um pequeno grupo de utilizadores.
8. Monitorizar métricas, erros e divergências.
9. Expandir gradualmente por empresa/filial.
10. Manter rollback testado até concluir o período de estabilização.

Nenhuma migração financeira deve apagar o modelo anterior antes de haver reconciliação e aceite formal.

---

## 7. Definition of Done

Uma tarefa só está concluída quando:

- critérios de aceitação estão automatizados ou documentadamente validados;
- lint, tipos, testes e build passam;
- autorização e tratamento de erro foram testados;
- logs não expõem dados sensíveis;
- migração e rollback foram considerados;
- documentação técnica e de utilizador foi atualizada;
- QA e Product Owner validaram o fluxo;
- não existe vulnerabilidade alta introduzida;
- métricas necessárias foram instrumentadas;
- release notes foram preparadas.

---

## 8. Indicadores de sucesso

### Segurança

- Zero chave privada no cliente.
- Zero vulnerabilidade crítica/alta sem mitigação aprovada.
- 100% dos comandos privilegiados autorizados no backend/main.
- 100% dos administradores com MFA.

### Dados

- 100% das operações financeiras atómicas.
- Divergência de reconciliação igual a zero.
- 100% dos backups verificados por checksum.
- Restauração testada mensalmente dentro do RTO definido.

### Qualidade

- Zero erro de lint e TypeScript.
- Cobertura mínima de 70% no domínio financeiro.
- Taxa de sucesso E2E superior a 99%.
- Redução contínua de `any`, ficheiros grandes e dívida técnica.

### Desempenho

- Arranque e navegação dentro dos SLOs definidos.
- APIs críticas com p95 monitorizado.
- Sincronização sem duplicação e com atraso mensurável.

### Experiência

- Redução do tempo médio para registar cliente, crédito e pagamento.
- Redução de erros de preenchimento.
- Acessibilidade WCAG 2.2 AA nos fluxos críticos.
- Satisfação dos operadores medida após cada grande entrega.

---

## 9. Ordem obrigatória de implementação

1. Segredos, chaves e autenticação Master.
2. Backup e restauração real.
3. Autorização no processo principal/backend.
4. XSS, CSP, TLS e privacidade.
5. Ledger, valores monetários e transações atómicas.
6. Migrações e testes automatizados.
7. Modularização e desempenho.
8. Design system e produtividade.
9. Backend multi-tenant e nova sincronização.
10. Novas funcionalidades e integrações.

Adicionar módulos antes dos itens 1 a 6 aumentaria o risco e o custo de correção futura.
