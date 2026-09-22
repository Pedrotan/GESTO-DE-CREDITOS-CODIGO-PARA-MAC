# Política de branch e pull requests

Aplicar à branch padrão no provedor Git:

- exigir pull request e uma aprovação de pessoa diferente do autor;
- invalidar aprovações quando novos commits forem enviados;
- exigir `verify`, `secret-scan`, `dependency-review` e `CodeQL`;
- impedir force-push e eliminação da branch;
- exigir resolução de conversas e histórico linear;
- restringir bypass a responsáveis de incidente, com auditoria.

Alterações financeiras, autenticação, licenciamento, migrações e recuperação exigem revisão de segurança ou dados além da revisão funcional.
