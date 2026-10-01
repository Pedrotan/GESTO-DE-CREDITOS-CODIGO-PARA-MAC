# Estado da implementação — 23 de setembro de 2026

Esta página regista as entregas técnicas realizadas até 23 de setembro de 2026. **O plano completo continua parcialmente implementado.** A verificação por fase, com lacunas também executáveis no workspace, está em `AUDITORIA_PLANO_IMPLEMENTACAO.md`. A aplicação compila, o baseline configurado de qualidade está limpo e parte dos fluxos críticos tem testes automatizados. As ações que exigem contas, infraestrutura, certificados ou validação humana estão enumeradas em `docs/SEGURANCA_E_OPERACAO.md`.

## Segurança e confiança

- Autenticação Master e normal controlada pelo processo principal, com sessões por renderer, expiração absoluta/inatividade, revogação e rate limit persistente.
- MFA obrigatório para Master e super administradores, segredo cifrado por `safeStorage`, códigos de recuperação de uso único e proteção global contra replay TOTP.
- Removidos senha Master padrão, token de desbloqueio previsível, chave de resgate distribuída, bypass de máquina e licenças legadas forjáveis.
- Licenciamento RSA canónico com `kid`, algoritmo, versão, `iat`, `exp`, UUID `jti`, máquina e limite de dispositivos. A chave privada fica no processo principal protegida pelo sistema operativo.
- IPC valida origem, sessão, permissão, tamanho, formato, URL e confirmações reforçadas. Leituras exigem sessão quando há utilizadores e mutações SQL só aceitam comandos registados numa allowlist gerada ou updates de colunas explicitamente declaradas.
- CSP restritiva, sanitização no armazenamento e apresentação, bloqueio de conteúdo ativo, TLS 1.2, certificados válidos, CORS allowlist, quotas e auditoria do lookup BI/NIF.
- Logger JSON instalado nos renderers e main com redaction de credenciais, tokens, documentos e dados identificados por chaves sensíveis.

## Dados financeiros e recuperação

- Ledger imutável de dupla entrada, hashes encadeados, unidades mínimas inteiras e triggers contra edição/eliminação.
- Pagamento, estorno, restauração e reforço atualizam crédito, cronograma, auditoria e ledger numa transação com versão otimista e idempotência.
- Reforços distribuem capital e juro pelas prestações abertas. Aprovação/rejeição são atómicas e aplicam maker-checker.
- Cronogramas PRICE, SAC e FLAT, conciliação FIFO, pagamentos parciais, mora e contador de prestações derivado das linhas liquidadas.
- Migrações versionadas cobrem unidades mínimas, MFA, cronogramas, reforços e remoção da antiga chave de resgate.
- Backups usam envelope cifrado versionado, checksum, publicação atómica, chave de recuperação portátil e validação antes da restauração. A web descarrega bytes reais da base.
- Desinstalação não apaga dados por omissão; importação e reset exigem confirmação reforçada e backup de segurança.

## Parcelas por cliente e arranque Electron

- A modal de detalhes do cliente separa créditos ativos com cronograma mensal de créditos liquidados no histórico. Cada crédito liquidado mantém código, principal, total contratual do cronograma, taxa, número de prestações, datas de liquidação e recibos.
- A liquidação de uma ou várias prestações usa sempre as mais antigas em aberto. O serviço volta a validar quantidade, montante e componentes contra o cronograma antes da transação; liquidação total é recusada se saldo e cronograma divergirem.
- A quitação altera o estado do crédito e do contrato na mesma transação; estorno e reposição revertem ou repõem o estado do contrato quando aplicável.
- A CSP permite apenas a compilação WebAssembly necessária ao SQLite da web. O arranque `electron:dev` usa uma exceção de sandbox limitada ao modo de desenvolvimento neste Windows; a aplicação empacotada mantém o sandbox. A validação de SQL aceita apenas os triggers imutáveis conhecidos durante a migração inicial.

## Cloud, desempenho e operação

- A sincronização cloud deixou de transportar SQL. O envelope cifrado contém comandos versionados identificados por hash ou snapshots com tabela/colunas validadas.
- Comandos incluem tenant, dispositivo, entidade, versão e timestamp. Duplicados são recusados no servidor; alterações financeiras remotas entram em `sync_conflicts` para revisão em vez de aplicação automática.
- Migração PostgreSQL de referência cria tenants, memberships, eventos, inbox, fila de jobs, índices e políticas RLS, com ensaio de isolamento.
- Rotas principais usam lazy loading e o CI aplica orçamento de bundle. Fontes dependem apenas da pilha local do sistema e `prefers-reduced-motion` é respeitado.
- CI executa lint, tipos, testes, builds, audit, CodeQL, gitleaks, dependency review e gera SBOM CycloneDX.
- Runbooks de incidente, corrupção, backup, privacidade, rotação, ambientes, releases e rollback estão em `docs/`.

## Validação final

| Gate | Resultado |
|---|---|
| ESLint | zero erros e zero avisos |
| TypeScript | aplicação, Electron e domínio financeiro em modo strict aprovados |
| Testes unitários/segurança | 45 aprovados |
| Build web | aprovado; orçamento de bundle aprovado |
| Build Electron | aprovado |
| Integração Electron | aprovada: backup/restauração, rollback, cadeia, dupla entrada e imutabilidade |
| Audit de dependências local | não executado: o registry local recusou o certificado; o gate permanece obrigatório no CI |

## Dependências externas restantes

- Revogar/rodar credenciais em provedores e confirmar inventário de builds já distribuídos.
- Criar repositório remoto, aplicar proteção de branch e exigir os checks configurados.
- Provisionar KMS/HSM, PostgreSQL, object storage, TLS/DNS, métricas/tracing e canais de release.
- Fornecer certificados Windows e Apple para assinatura, hardened runtime e notarização.
- Executar pentest independente, auditoria WCAG/usabilidade, homologação com dados mascarados, validação do Product Owner e exercícios operacionais de desastre.

Esses itens dependem de autoridade ou recursos fora do workspace. Não foram marcados como realizados.
