# Módulo de Compliance — documentação técnica, de utilização e de segurança

Referência: *BRAVALDO Compliance & Risk Management — Especificação funcional, técnica e roteiro de implementação da API* (v1.0, Novembro de 2026).
Este documento reúne os entregáveis da secção 11 que se aplicam ao sistema: arquitectura, correspondência com o catálogo de endpoints, dicionário de dados, perfis e permissões, manual de utilização, manual de segurança, plano de activação e recuperação, e testes.

> **Nota jurídica.** O módulo implementa controlos técnicos. Quais obrigações da Lei n.º 5/20 (e alterações), do Aviso BNA n.º 2/24, do Decreto Presidencial n.º 89/23 e da Lei n.º 22/11 se aplicam à actividade concreta da empresa tem de ser confirmado pela assessoria jurídica. Os pesos, limiares e listas iniciais são indicativos.

---

## 1. Arquitectura

O Compliance é um módulo do sistema de microcrédito (Electron + React, base SQLite local cifrada por empresa, sincronizada com a nuvem). Não há um servidor de Compliance à parte: a lógica corre no computador do utilizador e as regras críticas são impostas em três camadas.

| Camada | O que garante | Onde |
|---|---|---|
| Interface e serviços (renderer) | Validações, mensagens, permissões por perfil, segregação de funções | `src/servicos/compliance/*`, `src/paginas/compliance/*` |
| Processo principal (Electron) | Cada comando de escrita do Compliance exige a sua permissão e o autor gravado tem de ser o utilizador autenticado; conceder/aprovar/reforçar crédito passa pelo controlo de Compliance | `electron/main.ts` (`assertComplianceAutorizado`, `assertControloCompliance`), `src/bibliotecas/compliance/permissoes-compliance.ts` |
| Base de dados (triggers) | Nada se apaga; decisões imutáveis; quatro olhos; encerramentos só com os requisitos | `src/bibliotecas/compliance/esquema-compliance.ts` |

**Lógica pura e testada** (sem base de dados, igual no renderer, no processo principal e nos testes): `kyc.ts`, `duplicados.ts`, `motor-risco.ts`, `listas-xml.ts`, `screening.ts`, `monitorizacao.ts`, `casos.ts`, `relatorios.ts`, `politica-bloqueio.ts`, `controlo-credito.ts`.

**Integração por eventos (secção 7.2).** Em vez de uma fila de mensagens, a monitorização lê os registos financeiros já gravados (créditos, pagamentos, reforços, anulações, auditoria da taxa) e grava alertas com **identificador determinístico** (regra + operação). É uma reconciliação idempotente: repetir, correr noutro computador ou receber dados atrasados pela sincronização nunca duplica nem perde alertas, e nunca altera saldos ou lançamentos. Corre ao entrar e de 30 em 30 minutos (`TarefaMonitorizacaoCompliance`).

**Dados por dispositivo.** As entradas das listas de sanções (milhares de nomes) ficam só em cada computador (`compliance_lista_bloco`, fora da sincronização); a versão activa, os resultados e as decisões sincronizam. Uma lista que existe noutro computador mas não neste dá **ERROR**, nunca «sem correspondência».

---

## 2. Correspondência com o catálogo de endpoints (secção 6)

O sistema não expõe uma API REST de Compliance; cada endpoint da especificação corresponde a uma operação de serviço com o mesmo contrato (estados, validações, auditoria).

| Nº | Endpoint da especificação | Implementação |
|---|---|---|
| 1 | POST /compliance/kyc | `ServicoCompliance.registarVerificacao` |
| 2 | GET /compliance/clients/{id} | `ServicoCompliance.carregar` + `useCompliance` (ficha `/compliance/clientes/:id`) |
| 3 | PATCH /compliance/kyc/{id} | `ServicoCompliance.decidirVerificacao` (por outra pessoa) |
| 4 | POST /compliance/screening | `ServicoScreening.executar` / `executarLote` |
| 5 | POST /compliance/risk-assessment | `ServicoCompliance.avaliarRisco` |
| 6 | GET /compliance/risk-assessment/{id} | `compliance_risco_avaliacao` (ficha, relatório «Avaliações de risco») |
| 7 | POST …/{id}/reassess | `ServicoCompliance.avaliarRisco` (tipo «reavaliação», registo novo) |
| 8 | POST /compliance/transactions/monitor | `ServicoMonitorizacao.analisar` (idempotente) |
| 9–11 | GET/POST/PATCH /compliance/alerts | `ServicoMonitorizacao.carregar` / `analisar` / `mudarEstado` |
| 12–14 | POST/GET/PATCH /compliance/cases | `ServicoCasos.abrir` / `carregar` / `mudarEstado`, `atribuir`, `juntarEvidencia`, `ligar` |
| 15 | POST /compliance/decisions | `ServicoCasos.decidir` (conclusão, medida, UIF) |
| 16 | GET /compliance/audit | Relatório «Auditoria do Compliance» (`audit_logs`, entidade `compliance`) |
| 17–18 | POST/GET /compliance/reports | Página Indicadores e relatórios (`gerarRelatorio`, exportação CSV/PDF auditada) |

Estados do screening: `NO_MATCH`, `POTENTIAL_MATCH`, `NOT_CHECKED`, `ERROR` e `CONFIRMED_MATCH` (só por decisão humana). Estados dos alertas: `NEW`, `IN_REVIEW`, `INFORMATION_REQUESTED`, `SUBSTANTIATED`, `NOT_SUBSTANTIATED`, `CLOSED`. Decisão do crédito: `permitido`, `requer_revisao`, `pendente`, `bloqueado`.

---

## 3. Dicionário de dados

Todas as tabelas referenciam o cliente existente (`clients.id`): não há segunda ficha de cliente.

| Tabela | Finalidade | Imutabilidade |
|---|---|---|
| `compliance_perfil` | Perfil KYC (profissão, origem dos fundos, PEP, beneficiário efectivo, documentos entregues), estado do processo KYC, nível de risco, diligência e próxima revisão | Altera-se com auditoria; não se apaga |
| `compliance_kyc_verificacao` | Verificações de identidade (fonte, controlos, documento mascarado, decisão) | Decide-se uma vez, por outra pessoa; não se apaga |
| `compliance_risco_modelo` | Versões do modelo (pesos, escalões, prazos, listas, parâmetros da monitorização, política do crédito) | Conteúdo imutável; só muda a versão activa |
| `compliance_risco_avaliacao` | Avaliações (pontuação, factores, regras, dados usados, revisão humana) | Números imutáveis; revê-se uma vez, por outra pessoa |
| `compliance_duplicado_revisao` | Conclusões sobre dados partilhados entre clientes | Imutável |
| `compliance_lista_versao` | Versões das listas ONU/OFAC (data, entradas, SHA-256 do ficheiro) | Imutável (só a versão activa muda) |
| `compliance_lista_bloco` | Entradas das listas em blocos de 1000 (só neste computador) | Cache local (substitui-se na importação) |
| `compliance_lista_interna` | PEP nacionais e designações registadas pela empresa, com fonte oficial | Desactiva-se; não se apaga |
| `compliance_screening` | Resultado de cada screening (pessoas, fontes, versões, candidatos, critérios) | Imutável |
| `compliance_screening_decisao` | Decisão humana sobre cada possível correspondência | Imutável |
| `compliance_alerta` | Alertas da monitorização (regra, gravidade, evidências, ligação ao registo original, estado, resultado, conclusão, medidas) | Evidências imutáveis; conclusão uma vez; encerrado não muda; não se apaga |
| `compliance_alerta_historico` | Mudanças de estado e comentários dos alertas | Imutável |
| `compliance_caso` | Investigações (tipo, prioridade, prazo, responsável, estado, resumo final) | Encerrado não muda; não se apaga |
| `compliance_caso_ligacao` / `compliance_caso_nota` | Registos ligados e histórico do caso | Imutáveis |
| `compliance_evidencia` / `compliance_evidencia_ficheiro` | Evidências (metadados com SHA-256 e o ficheiro) | Imutáveis |
| `compliance_decisao` | Conclusão interna, medidas e decisão sobre a UIF (uma conclusão e uma decisão UIF por caso) | Imutável |
| `compliance_autorizacao` | Autorizações/recusas de Compliance para crédito (montante máximo, validade, motivos cobertos) | Imutável |
| `compliance_bloqueio_levantamento` | Levantamento de medidas de bloqueio (por pessoa diferente de quem bloqueou) | Imutável |

Auditoria: `audit_logs` (entidade `compliance`), com a cadeia SHA-256 e os selos do sistema.

---

## 4. Perfis e permissões (secção 4)

Permissões atribuídas na ficha do utilizador (o processo principal só aceita estas):

| Permissão | Permite |
|---|---|
| Compliance: Consultar (`compliance_view`) | Ver o módulo |
| Compliance: Registar (`compliance_manage`) | Perfil KYC, registar verificações, avaliar risco, screening, triagem de alertas, abrir e instruir investigações |
| Compliance: Decidir (`compliance_approve`) | Decidir verificações, rever avaliações, decidir correspondências, concluir/encerrar alertas e investigações, autorizar crédito, levantar bloqueios |
| Compliance: Modelo de risco (`compliance_settings`) | Novas versões do modelo e das listas oficiais, política do controlo do crédito |
| Compliance: Relatórios e exportação (`compliance_reports`) | Exportar relatórios (CSV/PDF), sempre auditado |

Perfil predefinido **Responsável de Compliance**: consulta clientes e créditos, todas as acções de Compliance; não cadastra, não aprova créditos, não movimenta valores. O **Auditor Interno** tem só leitura. Conflitos de segregação assinalados: «cadastrar clientes» com «validar KYC», e «validar KYC» com «aprovar crédito».

Quatro olhos impostos (serviço + base de dados): quem regista uma verificação não a decide; quem pede uma avaliação não a revê; quem abre uma investigação não regista a conclusão; quem decide um bloqueio não o levanta (o Super Administrador pode, com registo).

---

## 5. Manual de utilização (fluxos)

1. **Cliente novo** — Compliance › Painel › ficha do cliente: preencher o Perfil KYC (origem dos fundos, declaração PEP; nas empresas, beneficiário efectivo). Os dados de identificação corrigem-se no cadastro.
2. **Verificação de identidade** — «Registar verificação» (fonte e controlos feitos). Outro responsável abre a ficha e «Decidir verificação».
3. **Screening** — Compliance › Screening: importar o XML da ONU (obrigatório) e, se usado, da OFAC; registar na lista interna os PEP nacionais. «Rastrear os que precisam». Cada possível correspondência decide-se na ficha (falso positivo ou confirmada), com fundamento.
4. **Avaliação de risco** — ficha › «Avaliar risco». Situações com regra própria (PEP, sanção, país de risco, suspeita fundamentada, alertas fundamentados) não se diluem na média e pedem revisão por outro responsável.
5. **Alertas** — Compliance › Alertas de operações (corre sozinho de 30 em 30 minutos). Iniciar análise → pedir informação → concluir (fundamentado / não confirmado) → encerrar com medidas. «Abrir investigação» a partir do alerta.
6. **Investigação** — juntar evidências, passar à decisão, registar a conclusão interna (outra pessoa), as medidas e, **em separado**, a decisão sobre a UIF (o sistema não comunica com a UIF; regista a referência da comunicação feita pelos canais oficiais). Encerrar com resumo. **Sigilo:** não revelar ao cliente.
7. **Crédito** — na aprovação, no novo crédito e no reforço aparece o resultado do controlo de Compliance. Se pedir autorização, um responsável abre a ficha › «Controlo do crédito» e autoriza (montante máximo e validade) ou recusa, com fundamento.
8. **Relatórios** — Compliance › Indicadores e relatórios: indicadores da secção 10 e oito relatórios; exportar exige a permissão própria e fica registado.

---

## 6. Manual de segurança

- **Acessos**: permissões por utilizador (secção 4); o processo principal recusa comandos de Compliance sem a permissão certa ou com autor diferente do utilizador autenticado, e qualquer comando de Compliance não registado.
- **Integridade**: triggers impedem apagar e alterar registos de decisão; versões do modelo e das listas imutáveis; auditoria em cadeia SHA-256.
- **Dados pessoais**: BI/NIF mascarado nos ecrãs e relatórios (completo só com «Revelar NIF/BI» / «Incluir NIF/BI nas exportações»); as verificações guardam o número mascarado; cada consulta de evidência e cada exportação ficam na auditoria; evidências até 5 MB, com SHA-256.
- **SQL**: todos os comandos são texto fixo com parâmetros (sem interpolação), registados na lista de comandos permitidos do processo principal.
- **Listas**: importadas de ficheiros oficiais com SHA-256 registado; uma lista indisponível conta como erro, nunca como aprovação.
- **Incidentes**: um alerta ou decisão contestada nunca se apaga — regista-se nova decisão/medida; o histórico e a auditoria preservam a sequência.
- **Cópias de segurança**: as tabelas de Compliance fazem parte da base da empresa (cópias e sincronização do sistema). Após restaurar uma cópia noutro computador, importar de novo os ficheiros das listas (a cache local não vai na sincronização).

---

## 7. Activação, validação e recuperação (secções 9.1 e 14)

1. **Staging / piloto** com dados fictícios: o ambiente de teste `scratch/harness-compliance` (configuração `compliance-harness` em `.claude/launch.json`) corre o módulo sem login, com clientes e operações fictícios.
2. **Produção em modo «Só avisar»** (predefinido): o controlo do crédito mostra e regista o resultado, sem impedir. Comparar os resultados automáticos com a revisão humana e calibrar pesos, limiares e regras (cada alteração é uma versão nova do modelo).
3. **Validação jurídica** do enquadramento, dos efeitos e dos limites.
4. **Activar o bloqueio**: Modelo de risco › Controlo do crédito › «Bloquear», com a referência do parecer, a data e o responsável (sem isto a versão não grava). Fica registado na auditoria.
5. **Monitorizar** diariamente alertas, investigações fora do prazo, falsos positivos e erros de screening no período inicial.

**Rollback**: as migrações (`2026112401` a `2026112405`) só acrescentam tabelas e triggers — não alteram tabelas financeiras. Para desactivar os efeitos sem perder registos: criar uma versão do modelo em modo «Só avisar» ou «Desligado». RTO/RPO seguem os do sistema (cópias e sincronização da base da empresa).

---

## 8. Testes

| Ficheiro | Cobre |
|---|---|
| `tests/compliance-fase1.test.ts` | KYC, completude, documento, duplicados, motor de risco |
| `tests/compliance-fase2.test.ts` | Leitura ONU/OFAC, correspondência de nomes, estados do screening |
| `tests/compliance-fase3.test.ts` | Regras de monitorização, ciclo dos alertas |
| `tests/compliance-fase4.test.ts` | Casos, encerramento, indicadores, relatórios, CSV |
| `tests/compliance-fase5.test.ts` | Regra de decisão do crédito, autorizações, modos e validação jurídica |
| `tests/compliance-seguranca.test.ts` | Permissão e autor de cada comando, imutabilidade, SQL sem interpolação, mascaramento, controlos no processo principal |

Correr: `npm test` (todos) ou `node --test tests/compliance-*.test.ts`.
