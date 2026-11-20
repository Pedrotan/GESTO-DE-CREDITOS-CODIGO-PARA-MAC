# Consolidação de 25 de Outubro de 2026

## Diagnóstico

- Base anterior: `db5a888` (lucros previstos por mês e cadastro de clientes).
- Actualização fiscal: `0107ea0`, descendente dessa base. Não remove os commits anteriores de clientes, contratos, lucros previstos, RH ou sincronização.
- A VPS em `/var/www/tango-erp` ainda executava a base `db5a888` na consulta inicial.
- Existiam alterações locais ainda sem commit: Balanço, alertas contabilísticos, exclusão de prestações canceladas das previsões e relatório de actividade em português. Foram preservadas na consolidação.
- A conversa privada do Claude indicada pelo utilizador não pôde ser consultada. O diagnóstico usa o histórico Git, as diferenças locais, o código e a versão efectiva da VPS.

## Correcções

- Volume Docker persistente `tango_agt_keys`, montado em `/app/dados-agt`, para impedir a perda de chaves fiscais ao substituir o contentor.
- Exclusão de chaves AGT, ficheiros temporários e artefactos administrativos do contexto de compilação Docker.
- Remoção de referências redundantes a `electron-env.d.ts`: o ficheiro já está incluído por `tsconfig.node.json`.
- BOM do CSV de transferências de RH escrito explicitamente como `\uFEFF`, mantendo os mesmos bytes e eliminando o erro de carácter invisível na análise estática.

## Recuperação e rastreabilidade

Antes da publicação foram guardados na VPS, em `/var/backups/tango/recuperacao-20261025/`:

- `commit-anterior.txt`: revisão anterior;
- `fontes-anteriores.tar.gz`: fontes anteriores (sem os ficheiros de ambiente);
- `base-anterior.sql`: cópia PostgreSQL;
- `release.tar`: fontes consolidadas, incluindo alterações locais;
- `correcoes-validacao.tar.gz`: correcções adicionais da análise estática;
- registos de compilação e de validação.

A imagem anterior foi preservada como `tango-erp-app:antes-recuperacao-20261025`.
A compilação e os testes são executados separadamente da aplicação activa, em `/var/www/tango-validacao-20261025`; os testes usam um contentor sem rede e sem acesso aos volumes de produção.

As chaves e a certificação AGT continuam a exigir configuração real da empresa; a publicação não activa automaticamente a comunicação fiscal nem emite documentos.

## Resultado da validação e publicação

- Compilação web de produção concluída.
- ESLint: zero erros, 28 avisos.
- Verificação dos três projectos TypeScript concluída sem erros.
- Suite completa em Linux/Node 22: **443 testes aprovados, zero falhas, zero testes ignorados**.
- Imagem activada: `sha256:c8569f802280ca69d1612085d25dbde2e5c4ed00486a95c50380465c588c5d3b`.
- `/api/health` público: `healthy`, base de dados `connected_local_pg`.
- Aplicação e PostgreSQL com healthcheck `healthy` após a publicação.
- SHA-256 do HTML público e do HTML dentro do contentor coincidentes: `0bd6841e14113e7f9e4c7a2f5dff50329aed6c69ae12b9cf3083573c91818c3b`.

Os ensaios iniciais no Windows encontraram restrições EPERM e esgotamento de memória; o resultado de referência é a suite completa aprovada no contentor isolado Linux. A sessão privada do Claude e os fluxos autenticados na interface não foram inspeccionados visualmente.
