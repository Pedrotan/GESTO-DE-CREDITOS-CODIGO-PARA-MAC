# Tango Gestão de Créditos 3.0.2

- Sessões e MFA passaram para o processo principal, com recuperação de uso único e proteção do sistema operativo.
- Licenças legadas e bypasses foram removidos; emissão usa RSA canónico e metadados versionados.
- Pagamentos, correções, reforços e decisões de crédito usam transações, idempotência e ledger imutável de dupla entrada.
- Prestações são conciliadas por cronograma e os montantes financeiros novos usam unidades mínimas inteiras.
- Backups são cifrados, portáteis, versionados e verificados antes de serem apresentados como concluídos.
- IPC, CSP, TLS, importação, reset e gestão de contas receberam validações e autorizações adicionais.

Antes da atualização, criar e restaurar uma cópia de teste. O rollback da aplicação deve preservar a base migrada; versões antigas que não reconhecem o schema atual não devem abrir a base de produção.
