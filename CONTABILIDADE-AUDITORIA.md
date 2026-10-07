# Contabilidade e Auditoria — implementação e limites

## Falhas corrigidas
- Indicadores baseados em resumos e pagamentos mistos que confundiam capital e receita; o balancete e os relatórios usam as linhas do razão.
- Transferências tratadas como caixa, juros reconhecidos novamente no recebimento, estornos com contas diferentes das originais.
- Extrato do cliente acumulado na ordem inversa e sucesso de integridade mostrado sem verificação.
- Eliminação de auditoria, reabertura sem justificação e ausência de bloqueio de lançamentos em períodos fechados.
- Aprovação de abate separada da operação financeira: aprovação, abate, alteração de versão e auditoria agora são atómicos.
- Despesas sem comprovativo e despesas capazes de usar saldo existente noutra conta de disponibilidades.

## Controlos disponíveis
- Partidas dobradas imutáveis, montantes em cêntimos INTEGER, transações e bloqueio otimista. Cêntimos são valores exatos, não cálculos em float.
- Verificação de equilíbrio, cadeia contabilística, pagamentos sem crédito, alocações, prestações e saldo da carteira. Créditos abatidos são separados da carteira contabilística.
- Cadeia SHA-256 de todos os novos registos de auditoria, criada por trigger na mesma transação. Abrange inserções diretas e remotas. A cadeia é local por dispositivo e não é sincronizada; os registos recebidos são encadeados localmente.
- Migração explícita dos registos antigos para uma referência inicial da cadeia. Não comprova a integridade anterior à migração.
- Migração atómica/idempotente de linhas históricas comprovadas, sem alterar entradas originais; tipos desconhecidos, componentes incoerentes e falhas de hash são recusados.
- Verificação diária e notificações internas enquanto o aplicativo estiver aberto, além da verificação manual na página.
- Caixa por operador/dia, saldo esperado obtido no razão, saldo contado e motivo obrigatório das diferenças. Fechos e histórico são imutáveis.
- Catálogo de contas configurável, tesouraria, constituição/reversão de provisões e lançamentos livres administrativos. O catálogo técnico não é certificação regulamentar.
- Abate por pedido, aprovação por outro administrador, utilização de provisões e reconhecimento da perda restante. A dívida continua em cobrança; recuperações posteriores são receitas de recuperação.
- Aging, PAR30, provisões estimadas configuráveis e previsão de prestações em 7/30/60/90 dias. Estimativa e provisão contabilizada são conceitos distintos.
- Importação CSV/Excel de extratos, arquivo imutável, reimportação idempotente, correspondências uma a uma e revisão das ambiguidades. Um arquivo não confirma por si só o saldo bancário.
- Divergências pendentes/justificadas/resolvidas com motivo, utilizador, data, controlo de concorrência e auditoria atómica. A decisão não elimina um erro que a verificação continue a detetar.
- Despesas com categoria e comprovativo PDF/PNG/JPEG até 512 KB, guardado atomicamente com o lançamento e com verificação de hash ao descarregar.
- Cobrança atribuída a gestores, contactos, promessas e decisões finais imutáveis; metas mensais, desempenho e classificação interna com fórmula visível e tratamento de histórico insuficiente.
- Lembretes internos automáticos, com preparação de contactos três dias antes e no primeiro dia de atraso. Não são envios externos confirmados.
- Filtros de auditoria por utilizador/módulo/ação/período. Alertas de revisão para reabertura, alteração de taxa/capital após concessão, aprovação própria, diferenças de caixa e estornos frequentes.
- Diário, razão por conta, balancete com saldo inicial, resultados internos, fluxo de caixa, aging, divergências e auditoria em PDF/Excel. Exportações usam margens próprias, marca de água e termos em português.

## Dependências e pontos ainda não concluídos
- SMS/WhatsApp automático exige fornecedor, conta, credenciais e confirmação de entrega. A lista e os links de preparação não são tratados como mensagens enviadas.
- Verificações com todos os aplicativos fechados precisam de um executor ativo e de uma estratégia de acesso aos dados cifrados. Não há tarefa financeira de servidor implementada nesta arquitetura.
- Enquadramento PGC/PCIFB, códigos, taxas de provisão, regras de competência e demonstrações regulamentares precisam de validação contabilística. Os relatórios disponíveis são internos.
- Limites por perfil configuráveis na tesouraria, com capital validado no serviço financeiro e no Electron, auditoria e configuração partilhada. Permanecem desativados até configuração administrativa explícita.
- Rentabilidade por modalidade de amortização e responsável original, com juros previstos/recebidos, receita e despesas/perdas no razão e exportação PDF/Excel. Despesas gerais permanecem sem atribuição, sem rateio artificial.
- Aprovações de estornos de pagamento e de lançamentos manuais concluem o pedido na mesma transação financeira. O pedido é relido da base antes da decisão.
- Um catálogo comercial de produtos, segregação de todas as operações diretas e indicadores históricos de atraso/recuperação ainda requerem integração adicional.
- A migração reconstrói entradas históricas existentes e documentadas; não inventa operações antigas sem entrada/documento correspondente.
- As migrações históricas não foram executadas na base de produção. Não houve publicação nem commit nesta continuação.

## Validação
Testes cobrem pagamentos e saldos, rollback, estornos, juros já reconhecidos, abate/recuperação, comprovativos, cadeia SQLite/SQL.js, concorrência de decisões, arquivo de extratos, classificação e saldos dos relatórios. Tipos e compilações são verificados em separado. A verificação visual de todos os relatórios exportados e a migração numa cópia de uma base real continuam necessárias antes da utilização em produção.