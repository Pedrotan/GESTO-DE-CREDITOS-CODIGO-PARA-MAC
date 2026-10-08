# Guia Completo de Hospedagem na VPS Hostinger
## Tango Gestão e Créditos ERP (100% Produção)

Este guia contém o passo a passo completo e validado para hospedar o **Tango Gestão e Créditos ERP** na sua VPS da Hostinger (Ubuntu 22.04 ou 24.04 LTS), deixando o sistema, as APIs centrais e a base de dados a funcionar a 100% com HTTPS/SSL gratuito.

---

## 1. O que foi preparado no projeto

1. **`server.mjs`**: Servidor Node.js de produção para a VPS que serve simultaneamente:
   - O Frontend SPA (React + Vite) compilado, com suporte correto a WebAssembly (`sql-wasm.wasm`), cabeçalhos de segurança (CSP, HSTS, X-Frame-Options) e cache de longa duração.
   - Os endpoints de API central (`/api/v1/companies/status`, `/api/v1/companies/onboarding`, `/api/v1/auth/*`, `/api/sync`, `/api/tenants`, `/api/verify-company`).
   - Endpoint de monitorização de integridade: `GET /api/health`.
   - Ponte automática para PostgreSQL local / Docker ou Neon Cloud sem necessidade de alterar código.
2. **`docker-compose.yml` e `Dockerfile`**: Arquitetura em contentores com reinício automático (`restart: always`), separação de rede e base de dados PostgreSQL 16 com volume persistente.
3. **`infrastructure/postgres/init-vps.sql`**: Script de inicialização da base de dados com todas as tabelas, índices e restrições necessários.
4. **`nginx-tango.conf`**: Configuração do Nginx como proxy reverso com suporte a WebSockets, HTTP/2 e certificados SSL do Let's Encrypt.
5. **`ecosystem.config.cjs`**: Ficheiro de gestão de processos para quem preferir executar com PM2 diretamente no Ubuntu.
6. **`scripts/deploy-vps.sh`**: Script de configuração automática dos pacotes do Ubuntu na VPS.

---

## 2. Passo a Passo de Instalação na VPS Hostinger

### Passo 1: Conectar à sua VPS via SSH
No seu terminal (Windows PowerShell, CMD ou Mac/Linux Terminal), execute:
```bash
ssh root@SEU_IP_DA_HOSTINGER
```
*(Substitua `SEU_IP_DA_HOSTINGER` pelo endereço IP fornecido no painel da Hostinger, inserindo a senha de root configurada).*

---

### Passo 2: Clonar ou Enviar o Projeto para a VPS
Recomendamos clonar o repositório Git ou enviar os ficheiros via SCP/Git:
```bash
# Se usar Git:
cd /var/www
git clone https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git tango-erp
cd tango-erp

# Se já tiver os ficheiros na VPS, basta entrar na pasta do projeto:
cd /caminho/do/projeto
```

---

### Passo 3: Executar a Instalação Base das Dependências
Execute o script automatizado que atualiza o sistema e instala Node.js 20, Docker, Nginx, Certbot e PM2:
```bash
bash scripts/deploy-vps.sh
```

---

### Passo 4: Configurar as Variáveis de Ambiente (`.env`)
Copie o modelo de produção para `.env`:
```bash
cp .env.production.example .env
nano .env
```
No editor `nano`, preencha:
- `TANGO_SYNC_SECRET`: Uma chave segura para sincronização das empresas.
- `TANGO_MASTER_SECRET`: A sua senha de administração do Tango Master.
- `TANGO_MASTERGEN_URL`: O seu domínio (ex: `https://erp.seudominio.com`).
- `TANGO_ALLOWED_ORIGINS`: O seu domínio (ex: `https://erp.seudominio.com,http://localhost:3000`).

*(Pressione `Ctrl + O` e `Enter` para guardar, e `Ctrl + X` para sair).*

---

### Passo 5: Iniciar a Aplicação

Pode escolher uma das duas opções abaixo:

#### Opção A: Docker Compose (Recomendada - 1 Único Comando)
Esta opção inicializa a aplicação e a base de dados PostgreSQL em contentores isolados com persistência:
```bash
docker compose up -d --build
```
Para ver os registos (logs):
```bash
docker compose logs -f
```

---

#### Opção B: Instalação Nativa com PM2 e PostgreSQL
Se preferir rodar nativamente sem Docker:
```bash
# 1. Instalar dependências e compilar a aplicação web
npm install
npm run build:vps

# 2. Iniciar o servidor com PM2
pm2 start ecosystem.config.cjs --env production

# 3. Garantir que o PM2 inicia automaticamente se a VPS reiniciar
pm2 save
pm2 startup
```

---

### Passo 6: Configurar o Domínio e o Certificado SSL Gratuito (HTTPS)

1. **No painel de DNS do seu domínio (Hostinger ou Cloudflare):**
   - Crie um registo do tipo **A**:
     - **Nome / Host**: `erp` (ou `@` se for domínio principal)
     - **Aponta para (IP)**: O IP da sua VPS Hostinger
     - **TTL**: 300 ou Automático

2. **No servidor da VPS, configurar o Nginx:**
```bash
# Copiar o ficheiro de configuração
sudo cp nginx-tango.conf /etc/nginx/sites-available/tango-erp

# Ajustar o nome do domínio no ficheiro
sudo nano /etc/nginx/sites-available/tango-erp
# (Substitua 'erp.seudominio.com' pelo seu domínio real)

# Ativar o site no Nginx e testar
sudo ln -s /etc/nginx/sites-available/tango-erp /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

3. **Emitir o Certificado SSL Gratuito (Let's Encrypt com renovação automática):**
```bash
sudo certbot --nginx -d erp.seudominio.com
```
*O Certbot irá perguntar o seu e-mail para avisos de renovação e configurará o HTTPS automaticamente no Nginx.*

---

## 3. Verificação de Funcionamento (100% Operacional)

Execute o comando de teste para confirmar que o sistema está 100% ativo:
```bash
curl http://localhost:3000/api/health
```
Resposta esperada:
```json
{
  "status": "healthy",
  "app": "Tango Gestão e Créditos ERP",
  "environment": "production",
  "database": "connected_local_pg",
  "uptime": 120,
  "timestamp": "2026-10-08T..."
}
```

Aceda agora no seu navegador:
👉 `https://erp.seudominio.com`

---

## 4. Comandos Úteis de Manutenção no Dia a Dia

| Ação | Comando Docker | Comando PM2 |
|---|---|---|
| **Ver logs em tempo real** | `docker compose logs -f` | `pm2 logs tango-erp` |
| **Reiniciar aplicação** | `docker compose restart app` | `pm2 restart tango-erp` |
| **Parar aplicação** | `docker compose down` | `pm2 stop tango-erp` |
| **Atualizar código novo** | `git pull && docker compose up -d --build` | `git pull && npm install && npm run build:vps && pm2 reload tango-erp` |
| **Verificar uso de RAM/CPU** | `docker stats` | `pm2 monit` |
| **Backup da Base de Dados** | `docker exec -t tango_postgres pg_dump -U tango_user tangodb > backup.sql` | `pg_dump -U postgres tangodb > backup.sql` |
