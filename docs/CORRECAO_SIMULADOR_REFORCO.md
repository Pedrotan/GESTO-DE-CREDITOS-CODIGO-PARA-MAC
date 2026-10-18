# Correção do simulador e reforço de capital

- Simulações novas aceitam PRICE, SAC e FLAT. A migração SQLite reconstrói a tabela numa transação, copiando os campos das fichas e recriando os índices.
- Reforço no contrato existente exige prestação aberta escolhida pelo operador. O capital e juros adicionais entram apenas nessa prestação; as restantes não mudam. O desembolso é contabilizado agora. A taxa FLAT é a taxa total contratada; PRICE/SAC converte a TAN para um mês. O serviço valida a taxa diretamente na base e usa versões para detetar concorrência.
- Reforço como contrato separado cria um pedido FLAT com capital, taxa total e prazo próprios. A origem tem de ser um crédito ativo/em mora do mesmo cliente. O saldo e o cronograma do anterior não mudam. Aplica as alçadas e exige aprovação. A origem fica nas notas de aprovação. A exceção à regra de um crédito aberto só é aplicada neste fluxo validado.
- Pagamento: com vários contratos ativos do cliente, o assistente mostra aviso, seleção do contrato e confirmação explícita, inclusive quando aberto a partir da ficha. A confirmação é verificada também no envio final.
- Os reforços antigos não são redistribuídos automaticamente.

Validação: typecheck completo; 25 testes de integração e cálculos, incluindo conservação das prestações não selecionadas, mês inexistente, contrato separado, origem inválida, preservação de simulações e ficha PDF.
