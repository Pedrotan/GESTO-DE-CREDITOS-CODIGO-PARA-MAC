# Gerar os executáveis para macOS (MacBook)

Os instaladores do Mac só se geram num Mac: o electron-builder não cria `.dmg` a partir do Windows, e o SQLite cifrado (`better-sqlite3-multiple-ciphers`) tem de ser compilado para o macOS.

## 1. Levar o código

Use o pacote `Tango-ERP-codigo-mac.zip` gerado no Windows. Ele traz o código da última versão e o `public_key.json`.

- O `public_key.json` é a chave pública das licenças. Não está no git e é obrigatório: sem ele as licenças não validam. Não gere um par novo.
- Não copie a pasta `node_modules` nem as pastas `release`, `dist` e `dist-electron` do Windows. Os módulos nativos do Windows não funcionam no Mac.
- O `.env` é só da VPS. Não é preciso para gerar os executáveis.

Alternativa: fazer `git clone` do repositório e copiar só o `public_key.json` para a raiz.

## 2. Preparar o Mac (uma vez)

```bash
xcode-select --install
```

- Instale o Node.js 20 LTS ou mais recente, a partir de https://nodejs.org.
- Descompacte o pacote, por exemplo em `~/Projetos/tango-erp`.
- Use um caminho sem acentos, por segurança.

```bash
cd ~/Projetos/tango-erp
npm install
npm run check:mac
```

- O `npm install` corre o `postinstall` (`electron-builder install-app-deps`), que compila o SQLite cifrado para o Mac.
- Se o `check:mac` disser que o módulo nativo está por compilar, corra `npm run rebuild`.

## 3. Gerar os executáveis

| Mac | Com certificado Apple «Developer ID» | Sem certificado |
|---|---|---|
| Apple Silicon (M1, M2, M3, M4) | `npm run build:mac` | `npm run build:mac:adhoc` |
| Intel | `npm run build:mac:intel` | `npm run build:mac:intel -- -c.mac.identity=-` |
| Os dois (universal) | `npm run build:mac:universal` | `npm run build:mac:universal -- -c.mac.identity=-` |

- **Tango Master (licenças):** `npm run build:master:mac`, ou `npm run build:master:mac:adhoc` sem certificado.
- **Resultado** (na pasta `release/`):
  - `Tango Gestao de Creditos-<versão>-arm64.dmg`, para arrastar para Aplicações;
  - `.zip`;
  - `.pkg`, o instalador para `/Applications`.

## 4. Assinatura e primeiro arranque

- **Com certificado Developer ID** no Porta-chaves (conta Apple Developer paga):
  - o `build:mac` assina automaticamente;
  - para não aparecer o aviso do Gatekeeper noutros Macs, é preciso também notarizar com a Apple (`xcrun notarytool`).
- **Sem certificado** (`:adhoc`):
  - a aplicação fica com assinatura local, suficiente para correr nos Macs da empresa;
  - no primeiro arranque: botão direito na aplicação → **Abrir** → **Abrir**;
  - se o macOS disser que está «danificada» (ficheiro descarregado da Internet), corra:

```bash
xattr -dr com.apple.quarantine "/Applications/Tango Gestao de Creditos.app"
```

## 5. Dados e ligação à empresa

- No Mac, a base de dados fica em `~/Library/Application Support/Tango Gestão de Creditos ERP`. Nada é partilhado com a instalação do Windows.
- Para ter os mesmos dados, use no assistente inicial **«Ligar a empresa na nuvem»**, com o NIF e o Código de Acesso. Recebe os clientes, os créditos, os utilizadores, a identidade e as definições da empresa.
- A licença é por máquina: o Mac conta como mais um computador na licença.

## O que muda em relação ao Windows

- **Identificação do equipamento:** no Mac usa `ioreg` (IOPlatformUUID) em vez do PowerShell.
- **Digitalização WIA:** só existe no Windows. No Mac carregue os documentos a partir de um ficheiro.
- **Scripts de limpeza:** `clean`, `stop-apps` e `clean:artifacts` são do Windows. No Mac use `npm run clean:mac` e `npm run stop-apps:mac`.
