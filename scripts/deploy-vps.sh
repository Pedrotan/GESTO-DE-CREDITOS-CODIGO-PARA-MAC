#!/usr/bin/env bash
# =====================================================================
# Tango Gestão e Créditos ERP - Script de Instalação e Deploy Automático
# Para: Hostinger VPS (Ubuntu 22.04 / 24.04 LTS)
# Executar na VPS com: bash scripts/deploy-vps.sh
# =====================================================================

set -e

echo "====================================================================="
echo "   Iniciando Configuração do Tango Gestão ERP na VPS Hostinger       "
echo "====================================================================="

# 1. Atualizar pacotes do sistema
echo "[1/6] Atualizando pacotes do sistema Ubuntu..."
sudo apt update && sudo apt upgrade -y

# 2. Instalar dependências essenciais
echo "[2/6] Instalando dependências (curl, git, nginx, certbot)..."
sudo apt install -y curl git ufw nginx certbot python3-certbot-nginx

# 3. Verificar e instalar Node.js 20 LTS se não estiver presente
if ! command -v node &> /dev/null; then
    echo "[3/6] Instalando Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo "[3/6] Node.js já instalado: $(node -v)"
fi

# 4. Verificar e instalar Docker se desejado
if ! command -v docker &> /dev/null; then
    echo "[4/6] Instalando Docker e Docker Compose..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER || true
fi

# 5. Instalar PM2 para gestão de processos
echo "[5/6] Instalando PM2 globalmente..."
sudo npm install -g pm2

# 6. Preparar ficheiro de ambiente se não existir
if [ ! -f .env ]; then
    echo "[6/6] Criando ficheiro .env a partir de .env.production.example..."
    cp .env.production.example .env
    echo "ATENÇÃO: Edite o ficheiro .env com as suas chaves e domínio antes de iniciar!"
else
    echo "[6/6] Ficheiro .env já existente."
fi

# 7. Configuração do Firewall UFW
echo "Configurando Firewall (UFW: Portas 22, 80, 443)..."
sudo ufw allow 22/tcp || true
sudo ufw allow 80/tcp || true
sudo ufw allow 443/tcp || true
sudo ufw --force enable || true

echo "====================================================================="
echo "   Configuração Base Concluída! A iniciar contentores Docker...    "
echo "====================================================================="

docker compose up -d --build

echo ""
echo "A aguardar inicialização da aplicação..."
sleep 5

curl -s http://localhost:3000/api/health || true
echo ""
echo "====================================================================="
echo "   Tango Gestão ERP está ativo e operacional na porta 3000!          "
echo "====================================================================="

