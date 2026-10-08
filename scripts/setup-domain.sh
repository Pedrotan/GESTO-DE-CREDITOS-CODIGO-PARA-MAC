#!/usr/bin/env bash
# =====================================================================
# Configuração de Domínio e Certificado SSL Gratuito (HTTPS)
# Domínio: tangogestaoecreditos.tech
# =====================================================================

set -e

echo "====================================================================="
echo "   Configurando Nginx para o domínio tangogestaoecreditos.tech      "
echo "====================================================================="

# 1. Copiar configuração do Nginx
sudo cp nginx-tango.conf /etc/nginx/sites-available/tangogestaoecreditos.tech

# 2. Ativar o site e remover o default se existir
sudo ln -sf /etc/nginx/sites-available/tangogestaoecreditos.tech /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# 3. Testar sintaxe do Nginx
sudo nginx -t

# 4. Recarregar Nginx
sudo systemctl reload nginx

echo ""
echo "====================================================================="
echo "   Nginx ativo na porta 80! A emitir certificado SSL (Let's Encrypt)..."
echo "====================================================================="

# 5. Emitir SSL gratuito via Certbot
sudo certbot --nginx -d tangogestaoecreditos.tech -d www.tangogestaoecreditos.tech --non-interactive --agree-tos --register-unsafely-without-email --redirect || {
    echo "Aviso: Se o Certbot solicitar e-mail, execute: sudo certbot --nginx -d tangogestaoecreditos.tech -d www.tangogestaoecreditos.tech"
}

echo ""
echo "====================================================================="
echo "   SUCESSO! O seu ERP está disponível com HTTPS em:                 "
echo "   👉 https://tangogestaoecreditos.tech                             "
echo "====================================================================="
