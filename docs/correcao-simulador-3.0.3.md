# Simulador — atualização 3.0.3

Instalações existentes podiam manter a restrição `method IN ('price', 'sac')`: o arranque nativo já considerava o esquema pronto e não executava a migração do renderer. Por isso, reinstalar a aplicação preservava tanto os dados como a restrição antiga.

A migração passa a executar no worker nativo, antes de aceitar pedidos. Inspeciona o esquema real, permite `flat` e preserva colunas, índices, triggers, relações e histórico. Cria uma cópia cifrada consistente com o sufixo `.before-flat-3.0.3.bak` antes de alterar a base. É transacional e idempotente; as permissões SQL do renderer continuam iguais.

Validação: testes de preservação e rollback; teste no Electron com base cifrada antiga, reinício e INSERT completo de simulação FLAT; regressão de backup/restore cifrado e invariantes do livro contabilístico.

Instalar a versão 3.0.3 sobre a anterior e voltar a abrir a aplicação. Não é necessário apagar dados nem reinstalar a base.
