# Actualizações do Tango ERP (desktop e web)

Motor de actualizações controlado pela VPS e pelo **Tango Master**. Cada versão nova chega primeiro só à
**equipa de desenvolvimento**; depois de testada, o interruptor **«Disponibilizar actualizações para todos»**
no Tango Master envia-a a todas as empresas, em tempo real.

## 1. O que existia antes (auditoria)

| Área | Situação encontrada | O que foi feito |
|---|---|---|
| `package.json` (electron-builder) | NSIS per-machine, sem campo `publish`. O build gerava `app-update.yml` com `provider: github` (repositório **público**), mas não havia `electron-updater` instalado nem código que o usasse. | `electron-updater@6.8.10` instalado; `publish` passa a `generic` na VPS. O feed real é definido em tempo de execução por computador. |
| `electron/main.ts`, `preload.ts` | Sem actualizador. `before-quit` faz sempre uma cópia de segurança e `app.exit(0)`. | Novo `electron/actualizador.ts`; `before-quit` deixa o instalador fechar a app quando a cópia já foi feita. Preload: `window.electronAPI.updates` (5 pedidos + aviso). |
| VPS (`server.mjs`, `vercel-api/`) | `/events` (SSE) só com keepalive; sessões do Master em `_sessao-master.js`; licenças Ed25519. | Nova rota `/api/updates/*` (`vercel-api/updates.js` + `_actualizacoes.js`), separada de `/api/sync`. Reutiliza a sessão do Master e a chave das licenças. |
| Sincronização (`ServicoSincronizacaoCloud.ts`) | Fila local em IndexedDB, `syncCloudNow()`. | Não foi alterada. Antes de reiniciar/recarregar, o aviso chama `syncCloudNow()` (o que não sair fica na fila local). |
| Web (PWA) | `public/sw.js` serve tudo **cache-first**; `index.html` sem cache. | `version.json` por build; o service worker deixa `version.json` ir sempre à rede (sem isso o aviso nunca apareceria). |
| Tango Master | Painel com Empresas, Segurança, Licenças… | Novo separador **Actualizações** (interruptor, versões, equipa, auditoria). |

## 2. Como funciona

```
npm run build:erp → release/ (TangoGestaoCreditos_Setup.exe + latest.yml)
        ↓ node scripts/preparar-actualizacao.mjs   (confere SHA-512, prepara a pasta)
        ↓ scp → /var/www/tango-erp/dados-actualizacoes/<versão>/   (montada só leitura no contentor)
Tango Master › Actualizações › Registar versão   (servidor confere tamanho + SHA-512; fica SÓ EQUIPA)
        ↓ testar num computador da equipa
Interruptor «Disponibilizar actualizações para todos» = LIGADO  → aviso SSE a todos → verificam → feed → download
```

### A regra (igual no aviso, no feed e no download)

Para cada computador o servidor escolhe a **versão mais alta** que ele pode receber:

- versão **suspensa** → ninguém;
- computador da **equipa** (marcado no Master, ou de uma empresa marcada como equipa) → recebe;
- restantes → só se o interruptor estiver **ligado** e o computador cair dentro da percentagem de rollout
  (por omissão 100%; 5/25/50% usam um hash estável do identificador do computador + versão).

A regra é aplicada em `/api/updates/check` (aviso), em `/api/updates/feed/<id>/latest.yml` (o que o
electron-updater lê) **e** em `/api/updates/feed/<id>/files/<versão>/<ficheiro>` (o próprio instalador). Um
computador fora da regra recebe 404 mesmo que conheça o endereço. Registar uma versão nova nunca a publica para
todos: começa sempre desligada. Desligar o interruptor volta a reservar a versão à equipa (quem já a instalou
fica com ela; não há downgrade).

### Equipa de desenvolvimento

- **Por computador:** no Tango ERP, *Definições › Sobre › Actualizações* mostra o identificador deste computador
  (aleatório, criado na instalação — não é uma impressão digital). No Master, separador Actualizações, tabela de
  computadores, ligar «Equipa».
- **Por empresa:** «Marcar empresa como equipa» com o NIF/ID. Só conta para computadores que se registam com um
  **token de licença assinado pelo servidor** (chave TANGO-…); dizer o NIF não basta.

### Desktop (Electron)

- Verifica 10 s depois de abrir, a cada 4 h ± 30 min, ao religar o canal de avisos e quando chega um aviso
  em tempo real (com espera aleatória até 1 min para não chegarem todos ao mesmo segundo).
- Modal: versão, tamanho, notas, canal, «Atualizar agora» / «Mais tarde» (24 h; obrigatória: 1 h).
- «Atualizar agora» → `electron-updater` com feed `generic` próprio do computador → progresso → verificação do
  SHA-512 pelo electron-updater → «Guardar e reiniciar»: recusa enquanto houver um formulário aberto, envia a fila
  da nuvem, faz a cópia de segurança encriptada da base de dados (se falhar, **não** instala) e só então
  `quitAndInstall` (instalador visível; per-machine pede UAC). A app reabre na versão nova.
- **ACK:** depois do arranque, quando a interface nova pede o estado, espera 20 s e envia `/api/updates/ack`. Se a
  versão que arrancou não é a que se ia instalar, comunica `failed` (a versão anterior continua a funcionar).
- Em desenvolvimento (`npm run electron:dev`) só verifica; descarregar/instalar exige o executável instalado.
- O Tango Master **não** usa este canal (é outra aplicação, outro `appId`).

### Web

- Cada build gera `version.json` (`{ version, buildId }`) e embute o mesmo `buildId`. O separador aberto compara
  a cada 10 min, ao voltar ao separador e quando chega um aviso SSE.
- «Atualizar agora» espera que não haja formulário aberto («Atualiza quando terminar»), envia a fila de
  sincronização e recarrega. «Mais tarde» = 1 h.
- **Limite real:** a VPS serve uma só build web. O interruptor do Master **não** consegue reservar a web à
  equipa: a publicação da web é o próprio `docker compose up -d --build`. Para testar a web antes, use um
  ambiente separado (outra porta/subdomínio).

## 3. API (`/api/updates`)

| Método | Caminho | Quem | Notas |
|---|---|---|---|
| GET | `/check?deviceId&platform=win\|mac&arch&version` | público | `{ available, channel, release }` — sem endereços |
| POST | `/register` | público | `{ deviceId, kind, platform, arch, version, licenseToken? }` |
| POST | `/status` | público | estados: `up_to_date, available, downloading, downloaded, installing, verifying, succeeded, failed, deferred` |
| POST | `/ack` | público | idempotente |
| GET | `/feed/<deviceId>/latest.yml` (`latest-mac.yml`) | público | só a versão permitida a este computador |
| GET | `/feed/<deviceId>/files/<versão>/<ficheiro>` | público | volta a aplicar a regra; nomes validados, sem `..` |
| GET | `/events` | público | SSE: `{"type":"update.available", ...}` — só um sinal; o cliente volta a perguntar |
| POST | `/admin` | **sessão do Master** (`x-master-session`) | `overview, release-register, release-set-public, release-update, release-pause, release-resume, device-set-team, tenant-set-team` |

`/admin` não aceita a chave mestra: só a sessão aberta em `/api/tenants` (que já tem bloqueio por tentativas).
Cada acção fica em `tango_update_audit` (data, acção, versão, detalhe, IP) e aparece no Master.

Tabelas criadas automaticamente: `tango_update_releases`, `tango_update_devices`, `tango_update_team_tenants`,
`tango_update_audit`.

## 4. Variáveis e ficheiros na VPS

| Variável | Exemplo | Onde |
|---|---|---|
| `TANGO_UPDATES_DIR` | `/app/dados-actualizacoes` | já no `docker-compose.yml` |
| `TANGO_MASTER_SECRET` | (existente) | sessão do painel |
| `TANGO_LICENSE_SIGNING_KEY` | (existente) | identifica a empresa no registo |

`docker-compose.yml` monta `./dados-actualizacoes:/app/dados-actualizacoes:ro`. Na VPS:
`/var/www/tango-erp/dados-actualizacoes/3.0.4/{TangoGestaoCreditos_Setup.exe,latest.yml}`.
O `nginx-tango.conf` tem um bloco para `/api/updates/events` (sem buffer, 1 h) — aplicar no nginx da VPS.

## 5. Publicar uma versão (passo a passo)

1. Subir a versão em `package.json` (ex.: 3.0.4) e gerar o instalador:
   ```bash
   npm run build:erp
   ```
2. Preparar e conferir a pasta:
   ```bash
   node scripts/preparar-actualizacao.mjs
   ```
3. Copiar para a VPS (o comando aparece no fim do passo 2):
   ```bash
   scp -r "release/actualizacao/3.0.4" root@191.215.45.104:/var/www/tango-erp/dados-actualizacoes/
   ```
4. Tango Master › **Actualizações** › Registar versão `3.0.4` com as notas. Fica só para a equipa.
5. Num computador da equipa: aparece o modal → Atualizar agora → Guardar e reiniciar → confirmar que abre na 3.0.4
   e que o Master mostra «Instalada».
6. Ligar **«Disponibilizar actualizações para todos»**. Para um arranque cauteloso, escolher 5% ou 25% na coluna
   Rollout e subir depois.

**Problema numa versão:** «Suspender» corta logo aviso e download. Não há downgrade automático: publique uma
versão corrigida (3.0.5) e siga os mesmos passos.

## 6. Segurança

- Só `https://tangogestaoecreditos.tech` é aceite como servidor de actualizações no executável instalado
  (`trustedUpdateServer`); o aviso SSE nunca leva endereços nem comandos (os campos desconhecidos são descartados).
- O electron-updater confere o SHA-512 do instalador com o feed. **Atenção:** o feed vem da mesma VPS — com a VPS
  comprometida, o SHA-512 não chega. A protecção contra isso é a **assinatura de código** (ver bloqueios).
- `autoDownload` e `autoInstallOnAppQuit` desligados, sem downgrade, sem pré-versões, download diferencial
  desligado (o servidor envia o instalador inteiro).
- Preload: só `getStatus/check/download/install/defer/onStatus`; o `defer` valida 1–72 h; o processo principal
  valida o remetente IPC (`assertTrustedIpcSender`).
- Dados do utilizador ficam em `userData` (fora dos ficheiros substituídos); `deleteAppDataOnUninstall: false`.

## 7. Guia de migração (clientes com versão sem actualizador, ≤ 3.0.3)

Estas versões não têm o código do actualizador: **têm de instalar uma vez** a primeira versão com actualizador
(3.0.4 ou superior). A partir daí as seguintes chegam sozinhas.

1. Gerar e publicar a 3.0.4 como acima (passos 1–6), para que fique registada e os computadores migrados já a
   vejam como actual.
2. Enviar a cada empresa o `TangoGestaoCreditos_Setup.exe` da 3.0.4 (portal/WhatsApp/e-mail, como hoje).
3. No computador: fechar o Tango ERP, correr o instalador **na mesma pasta** (instala por cima; mesmo `appId`
   `com.sistema.tangoerp`). Base de dados, licença e preferências ficam em `%APPDATA%` e mantêm-se.
4. Abrir: em *Definições › Sobre › Actualizações* deve aparecer a versão 3.0.4 e «Tem a versão mais recente».
   No Master o computador aparece na tabela com a versão.
5. Antes da migração, por precaução: *Definições › Cópia de segurança* e guardar a chave de recuperação.

## 8. Testes

Executados neste ambiente (Windows 11, Node 24.21, Electron 33.0.0) a 2026-10-25:

| Comando | Resultado |
|---|---|
| `node --test tests/actualizacoes-regras.test.mjs` | 6/6 passaram (semver, canal, rollout, latest.yml, caminhos) |
| `node --test tests/actualizacoes-servidor.test.mjs` | 12/12 passaram (PostgreSQL PGlite + servidor HTTP real; o `parseUpdateInfo`/`resolveFiles` do próprio electron-updater lê o feed e o instalador servido confere com o SHA-512; SSE recebe o aviso ao ligar o interruptor) |
| `node --test tests/actualizacoes-cliente.test.ts` | 5/5 passaram (servidor de confiança, validação da resposta, adiamento, SSE, intervalos) |
| `npm test` | 469/469 passaram |
| `npm run typecheck`, `npm run build:electron` | sem erros |
| Electron 33 carrega `electron-updater` | confirmado (`ELECTRON_RUN_AS_NODE`) |
| Web no navegador (build de produção) | aviso aparece com `version.json` novo; «Mais tarde» adia 1 h; com formulário aberto não recarrega e recarrega sozinho ao fechar; sem aviso quando a versão é igual |

**Não testado aqui (precisa de executáveis instalados e da VPS):** v1 instalada → v2 pelo feed real; UAC no
Windows; download interrompido; macOS; vários clientes em simultâneo na VPS.

## 9. Bloqueios para produção

1. **Assinatura de código (Windows):** o instalador não está assinado. Com certificado Authenticode, acrescentar
   `"publisherName": ["DIGITAL NORTE ..."]` em `build.win`; o electron-updater passa então a recusar instaladores
   de outro editor. Sem isso, a integridade depende só do HTTPS + SHA-512 do feed.
2. **macOS:** Squirrel.Mac exige app assinada (Developer ID) e notarizada, e o ZIP no feed (`latest-mac.yml`).
   O servidor já serve `latest-mac.yml`; falta a assinatura.
3. **VPS:** aplicar na VPS o `docker-compose.yml` e o `nginx-tango.conf` novos, criar
   `/var/www/tango-erp/dados-actualizacoes` e reconstruir o contentor (só quando autorizado).
4. **Escala:** o servidor Node serve o instalador (~130 MB). Para milhares de downloads simultâneos, servir a pasta
   pelo nginx/CDN mantendo a verificação da regra (ex.: `X-Accel-Redirect`).
5. **PM2 em cluster:** os avisos SSE são em memória por processo. O contentor corre um processo (ok); em cluster,
   os avisos só chegam a parte dos clientes — a verificação periódica (4 h) cobre o resto.

## 10. Critérios de aceitação

| Critério | Estado |
|---|---|
| v1 instalada detecta v2 elegível sem abrir o navegador | NÃO TESTADO (código pronto; falta instalar v1 e publicar v2) |
| Aviso em tempo real desperta a verificação; offline encontra no arranque/periódica | PASSOU no servidor (SSE) e nos testes do cliente; NÃO TESTADO no executável |
| Utilizador confirma download e, depois de guardar, o reinício | PASSOU na lógica; NÃO TESTADO instalado |
| Pacote inválido / URL não autorizado é recusado | PASSOU (SHA-512 no registo, feed só com ficheiros validados, servidor só HTTPS oficial); editor não confiável: FALHOU — sem assinatura de código |
| App reabre na v2 e reporta ao servidor | NÃO TESTADO |
| Rollout/interruptor respeitado também no feed e no download | PASSOU |
| Desktop v1 e v2 sincronizam durante o rollout | NÃO TESTADO (protocolo de sincronização não foi alterado) |
| Web avisa e recarrega sem perder trabalho em edição | PASSOU (navegador, build de produção local) |
| Falha deixa a versão anterior a funcionar | PASSOU na lógica (cópia falhada não instala; instalação incompleta é reportada); NÃO TESTADO instalado |
| Admin publica, pausa e audita com autenticação | PASSOU (sessão do Master, auditoria) |
| Procedimento de migração das versões antigas | Documentado (secção 7) |
