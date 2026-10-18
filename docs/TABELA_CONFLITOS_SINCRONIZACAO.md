# Tabela e arquivo de conflitos de sincronização

A mesma tabela está disponível em Definições → Sincronização e Nuvem e em Conflitos de Sincronização.

- Pesquisa por identificador, tipo, motivo, decisão ou responsável; filtros de estado e tipo; ordenação por data e paginação de 10 a 200 linhas.
- Administradores podem arquivar pendentes individualmente ou por selecção da página. O diálogo explica que o arquivo retira a operação da fila sem a aplicar e solicita um motivo. O registo original fica preservado, com responsável e data, e pode ser restaurado.
- O arquivo usa o estado `rejected` e a marca reservada `[ARQUIVADO] ` na nota, respeitando o CHECK do esquema existente e a compatibilidade com clientes anteriores. A tabela apresenta esses registos como Arquivados. Não é necessária migração da base.
- Cada lote (até 200) e a sua auditoria são gravados numa transacção. Uma alteração concorrente de estado faz o lote falhar sem arquivo parcial. O arquivo é local ao dispositivo, como os restantes conflitos.
- Administradores podem baixar relatórios PDF e CSV com todos os conflitos, motivos, notas e datas, independentemente dos filtros/paginação. O JSON inclui também o conteúdo integral das operações. A visualização das operações completas e a exportação respeitam a mesma permissão de administração das decisões. Nenhuma chave da configuração de sincronização é acrescentada ao relatório.
- O cabeçalho deixa de usar “Modo Cloud” como alternativa para uma sincronização incompleta. Apresenta conflitos, pendências ou verificação da ligação; “Sincronizado” a verde continua reservado ao estado de sincronização concluída.

Validação: TypeScript e lint dos componentes novos; 15 testes SQLite/regras de sincronização/utilizadores; teste visual com 237 registos fictícios, arquivo e restauro de dez registos, pesquisa e paginação; PDF descarregado pelo navegador e verificado com 10 páginas e 237 identificadores distintos.

Publicação web feita em `/root/tango-erp` na VPS, com backup em `/root/tango-conflitos-backup-20261017/anterior.tgz`. Assets copiados antes do HTML, sem reiniciar a API. O hash do HTML publicado por HTTPS foi confirmado. Os registos reais da empresa não foram arquivados automaticamente.

Instalador final: `release/conflitos-atualizado/TangoGestaoCreditos_Setup.exe`. A geração terminou com sucesso e o pacote ASAR foi verificado: o HTML corresponde à compilação actual e inclui a nova tabela. Fechar o desktop antes de instalar; na web, actualizar a página para carregar os novos assets.
