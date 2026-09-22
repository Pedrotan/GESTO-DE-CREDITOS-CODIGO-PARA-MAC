# Segurança e operação

## Fronteiras de confiança

O renderer é tratado como não confiável. Sessões Master e de utilizadores vivem no processo principal, são associadas ao `webContents`, expiram por inatividade e por prazo absoluto e são revogadas no logout ou fecho da janela. Comandos IPC validam a origem, a sessão, a permissão e os limites do payload. O bootstrap sem sessão só permanece disponível enquanto a base não possui utilizadores.

O banco local é cifrado e aberto pelo worker. Pagamentos, estornos, restaurações, reforços e decisões de crédito usam transações com controlo otimista. O ledger e a auditoria financeira são imutáveis por triggers. Backups usam envelope cifrado versionado, checksum e chave de recuperação portátil.

## Threat model resumido

| Ameaça | Controlo |
|---|---|
| Renderer comprometido | isolamento de contexto, sandbox, origem IPC, sessão no main e autorização por comando/tabela |
| Roubo de credenciais | bcrypt/scrypt, MFA obrigatório, rate limit persistente e mensagens sem enumeração |
| Repetição de operação | chave idempotente, versão otimista e TOTP de uso único por janela temporal |
| XSS e conteúdo ativo | CSP, sanitização fixa no armazenamento e apresentação, bloqueio de scripts/handlers/URLs ativas |
| Corrupção financeira | transações, inteiros em unidades mínimas, dupla entrada, hashes e triggers de imutabilidade |
| Perda do dispositivo | backup portátil cifrado, checksum e restauração verificada |
| Isolamento cloud | chave individual por tenant, hash no servidor e separação por `tenant_hash` |

## Checklist Electron e ASVS

- `contextIsolation`, `sandbox` e `webSecurity` ativos; `nodeIntegration` desativado.
- Navegação e abertura externa limitadas a protocolos autorizados.
- CSP aplicada no Electron e na aplicação web.
- Segredos TOTP e chave privada de licenciamento protegidos por `safeStorage`.
- Palavra-passe e segredos MFA nunca são devolvidos ao renderer.
- SMTP exige TLS 1.2 e valida certificado.
- CORS usa allowlist; endpoints públicos têm autenticação, limites e quotas.
- Importação, reset e eliminação exigem confirmação textual reforçada.
- A janela oculta de impressão PDF mantém o plugin PDF estritamente para impressão nativa; não navega para conteúdo remoto.

## Inventário de segredos e rotação

| Segredo | Armazenamento esperado | Rotação |
|---|---|---|
| `DATABASE_URL` | secret store da plataforma cloud | após exposição e a cada mudança de operador |
| `TANGO_MASTER_SECRET` | KMS/secret store cloud | trimestral ou após incidente |
| chave por tenant | apenas hash no PostgreSQL; valor mostrado uma vez | por empresa e após suspeita |
| chave RSA de licença | `safeStorage` local no Master; KMS/HSM em produção | por `kid`, mantendo chave pública anterior durante migração |
| certificados de assinatura | cofre do CI/provedor de assinatura | conforme validade e após incidente |

Nenhum valor real foi encontrado no workspace. A revogação de credenciais já distribuídas exige acesso às contas externas e deve ser registada no relatório do incidente.

## Retenção e privacidade

BI/NIF só pode ser consultado por utilizadores autorizados, com finalidade operacional e auditoria sem gravar o documento no log. Logs técnicos devem excluir passwords, tokens, chaves, BI/NIF completos e dados bancários. Auditoria financeira e contratos seguem o prazo legal definido pelo responsável de conformidade; pedidos e dados auxiliares devem ser eliminados ao terminar a finalidade, respeitando bloqueios legais.

## Runbooks

### Falha ou corrupção da base

1. Interromper escritas e preservar a base, WAL e SHM.
2. Copiar os ficheiros para meio somente leitura e calcular SHA-256.
3. Executar `integrity_check` numa cópia.
4. Restaurar o último backup verificado numa pasta isolada com a chave de recuperação.
5. Reconciliar ledger, pagamentos e saldos antes de substituir a base ativa.
6. Registar RPO, RTO, causa e evidências.

### Falha de backup

1. Confirmar espaço, permissões e disponibilidade de `safeStorage`.
2. Não atualizar a data de sucesso.
3. Gerar backup manual para segundo meio e validar checksum/restauração.
4. Escalar se a cópia externa 3-2-1 ultrapassar 24 horas.

### Incidente de segurança

1. Revogar sessões, segredos e chaves afetadas.
2. Preservar logs e artefactos sem incluir dados pessoais no canal de comunicação.
3. Bloquear versões vulneráveis e emitir atualização obrigatória assinada.
4. Comunicar aos responsáveis definidos e documentar alcance, mitigação e recuperação.

## Dependências externas obrigatórias

Não podem ser concluídas apenas no workspace: rotação em provedores, configuração de KMS/HSM, PostgreSQL e object storage geridos, DNS/TLS, proteção de branch no GitHub, certificados Windows, notarização Apple, publicação alpha/beta/stable, pentest independente, teste com utilizadores, validação do Product Owner e exercícios organizacionais mensais/semestrais. O código e os workflows deixam os pontos de integração preparados; cada execução requer credenciais e autoridade do respetivo proprietário.
