# Verificação do plano de implementação — 23 de setembro de 2026

## Conclusão

**Nem todas as fases foram implementadas.** Nenhuma das fases 0 a 8 satisfaz integralmente todas as atividades e critérios de aceitação de `PLANO_DE_IMPLEMENTACAO.md`. Há uma base funcional importante nas fases 1 e 2, mas o produto ainda não cumpre a Definition of Done do plano para uma entrega completa ou para operação multiempresa em produção.

Esta verificação compara os requisitos explícitos do plano com o código, a configuração, os testes e a documentação presentes no repositório. A ausência de código ou teste foi classificada como «não comprovado» ou «não implementado no repositório», conforme o caso. Não foram verificadas contas cloud, instalações já distribuídas nem operações de equipas externas. A tabela abaixo regista o estado no momento da auditoria inicial; os avanços posteriores estão no fim deste documento.

| Fase | Estado | Evidência de implementação | Lacunas que impedem o fecho |
|---|---|---|---|
| 0 — Contenção | Parcial | Repositório Git, exclusão de artefactos e política de PR documentada. | Proteção da branch ainda não aplicada no remoto; inventário de distribuições/segredos, rotação de credenciais e cópia verificada das bases reais dependem de execução externa. Ver `docs/INVENTARIO_RELEASES.md`. |
| 1 — Segurança | Parcial | Sessões no processo principal, MFA, IPC com autorização, CSP, sanitização e TLS. | O renderer ainda expõe `db-query` e `db-transaction`, apesar da allowlist; falta substituí-los por comandos de domínio. A chave de assinatura continua gerida pelo Electron Master com `safeStorage`, sem KMS/HSM ou serviço isolado. Não encontrei revogação de licenças por `jti` nem lista de dispositivos autorizados. O rate limit da API usa memória local, não armazenamento distribuído. |
| 2 — Finanças e backups | Parcial | Ledger de dupla entrada, cronogramas, transações de pagamento/estorno/reforço/aprovação e backup portátil testado. | `credits`, `payments`, `contracts` e `accounting_entries` ainda mantêm montantes `REAL`; o saldo é atualizado a partir de valores mutáveis, não recalculado exclusivamente do ledger. Não encontrei fluxos completos de refinanciamento, renegociação e write-off, nem testes de migração de todas as versões suportadas. A política 3-2-1 e o exercício mensal não estão demonstrados. |
| 3 — Engenharia e testes | Parcial | Lint e tipos passam; 40 testes unitários/segurança passam; CI tem build, audit, secret scanning, CodeQL e SBOM. | `strict` cobre apenas seis módulos; não há medição de cobertura, testes E2E web/Electron para todos os fluxos exigidos, testes de carga 10 mil/100 mil/1 milhão ou gate de formatação. Assinatura de artefactos e bloqueio real de merge não estão comprovados. |
| 4 — Arquitetura e desempenho | Parcial | Serviços e repositórios separados; funções financeiras centrais fora de React; lazy loading e orçamento de bundle. | `ContextoDados.tsx` tem cerca de 2.640 linhas e carrega coleções inteiras; várias páginas ultrapassam 500 linhas. Repositórios de clientes/pagamentos fazem `SELECT *` sem paginação. Não encontrei benchmark de 100 mil registos, SLO medido, virtualização geral, OPFS/backend para a base web nem workers para relatórios pesados. |
| 5 — Experiência e acessibilidade | Parcial | Componentes reutilizáveis, temas e preferência de movimento reduzido; interface de backup e sincronização. | Não encontrei pesquisa global ligada à navegação, command palette funcional, favoritos, catálogo visual, nem interface de decisão dos registos em `sync_conflicts`. Não há auditoria WCAG 2.2 AA, testes de teclado ou testes de usabilidade que comprovem os critérios. |
| 6 — Cloud e sincronização | Parcial | API de sincronização autenticada por tenant, comandos cifrados/versionados, deduplicação e SQL de referência para PostgreSQL/RLS. | A API atual funciona como retransmissor de operações cifradas, sem PostgreSQL como fonte de verdade dos domínios financeiros. As migrações RLS de referência não estão integradas na API em execução. Não encontrei isolamento completo de utilizadores/filiais/carteiras, object storage, tombstones, compactação, resolução operacional de conflitos, fila com retries/dead-letter ou scheduler distribuído. |
| 7 — Funcionalidades de negócio | Parcial | PRICE/SAC/FLAT, simulação, reforço, aprovação maker-checker simples, cobrança e contabilidade existentes. | Faltam ou não estão comprovados scoring versionado/explicável, PAR/vintage/ECL, aprovação multinível e dupla aprovação, fecho e reconciliação bancária completos, portal do cliente, API OAuth2 pública, webhooks de saída assinados e integrações bancárias/fiscais completas. |
| 8 — Produção e operação | Parcial | Logger JSON com redaction, runbooks, configuração de assinatura no builder e notas de release. | O logger não inclui correlation ID nem tenant ID; não encontrei instrumentação operacional de métricas, tracing, alertas, dashboard de saúde ou atualizador automático assinado com rollback. Assinatura/notarização, canais de release, pentest e exercícios de desastre exigem execução e evidência externas. |

## Evidências decisivas

- O plano exige montantes sem `REAL` e saldo derivado do ledger (`PLANO_DE_IMPLEMENTACAO.md`, fase 2). O schema em `src/bibliotecas/adaptador-sqlite.ts` ainda declara `principalAmount REAL`, `currentBalance REAL`, `payments.amount REAL` e `accounting_entries.amountTotal REAL`; `src/servicos/ServicoFinanceiro.ts` atualiza `credits.currentBalance` a partir de `creditUpdate`.
- O plano exige comandos de domínio no lugar de SQL genérico (`PLANO_DE_IMPLEMENTACAO.md`, fase 1). `electron/preload.ts` continua a oferecer operações que invocam `db-query` e `db-transaction`; `electron/main.ts` mantém os handlers. A política SQL mitiga o risco, mas não conclui a substituição arquitetural.
- `infrastructure/postgres/001_multi_tenant_core.sql` e `002_rls_isolation_test.sql` são uma base de referência. A API ativa em `vercel-api/sync.js` cria `tango_tenants` e `tango_sync_operations` e apenas armazena/retransmite payloads cifrados; não usa aquelas tabelas de domínio com RLS como fonte financeira autoritativa.
- `src/servicos/ServicoSincronizacaoCloud.ts` guarda conflitos financeiros em `sync_conflicts`. A pesquisa por essa tabela no código da interface não encontrou ecrã de análise/decisão.
- `package.json` não define cobertura ou E2E web. Os testes em `tests/` cobrem regras financeiras, segurança e backup, mas não demonstram os percentuais e percursos exigidos pelo plano.

## Verificação executada

Em 23 de setembro de 2026, `npm run check` passou: lint, verificações TypeScript configuradas e **40 testes aprovados**. Este resultado valida o conjunto atual de verificações; não equivale a cumprir cobertura, E2E, desempenho, acessibilidade ou prontidão operacional. Os builds e o teste de integração Electron constam da validação anterior em `ESTADO_IMPLEMENTACAO.md` e não foram repetidos nesta auditoria.

## Ordem de fecho recomendada

1. Fechar os critérios P0/P1 ainda abertos nas fases 0–2: rotação e inventário reais, revogação de licenças, comandos de domínio em IPC, dinheiro sem `REAL`, ledger como fonte do saldo, migrações de bases antigas e restauração operacional.
2. Criar testes E2E, cobertura e ensaios de carga antes de refatorar `ContextoDados` e paginação; medir os SLOs do plano.
3. Completar UX/acessibilidade e os fluxos de negócio da fase 7 com validação de operadores e Product Owner.
4. Tornar o backend cloud autoritativo, aplicar RLS no serviço real e testar sincronização entre dispositivos; depois configurar observabilidade, assinatura, atualização e operação contínua.

Até esses pontos serem concluídos e validados, o estado correto é **plano parcialmente implementado**.

## Avanços após a auditoria inicial

- A API passou a limitar pedidos através de contador atómico partilhado em PostgreSQL, com recusa de pedidos quando o contador está indisponível; a limitação em memória deixou de ser a proteção dos endpoints de produção alterados.
- A interface passou a mostrar conflitos financeiros de sincronização para decisão administrativa, com motivo e registo de auditoria. Continua sem aplicar automaticamente operações financeiras remotas.
- Despesas manuais passaram a gerar, na mesma transação, o lançamento contabilístico, duas linhas equilibradas no ledger e auditoria. A criação e aprovação de crédito passaram a registar o desembolso inicial na transação financeira.
- Foram acrescentados ajustes justificados de juros e mora que atualizam o cronograma e o ledger de forma atómica. Montantes nas leituras alteradas dão preferência às colunas inteiras em unidades mínimas.
- A atualização genérica do crédito foi restringida a metadados, impedindo alterações diretas de capital, taxa e saldo. A ação antiga de renovação foi desativada até existir política formal de reestruturação.
- A falha de leitura ou migração da base local deixou de criar silenciosamente uma base vazia; o erro é apresentado em vez de ocultar a base anterior.

O utilizador informou que não dispõe atualmente de repositório remoto nem de contas de PostgreSQL, armazenamento, KMS ou certificados de assinatura. A resposta sobre write-off, refinanciamento, ECL e alçadas trouxe uma proposta de definição de políticas, sem critérios aprovados. Assim, as fases que exigem implantação externa ou decisões financeiras normativas continuam abertas. Os 43 testes configurados, lint, TypeScript e builds web/Electron passaram após as alterações locais, mas não substituem testes de migração abrangentes, E2E, carga, acessibilidade, implantação e operação real.
