# =====================================================================
# Tango Gestão e Créditos ERP - Dockerfile de Produção para VPS
# =====================================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependências necessárias para compilação nativa se necessário
RUN apk add --no-cache python3 make g++

COPY package*.json ./

# Instalar todas as dependências para o build
RUN npm ci --omit=optional

COPY . .

# Compilar frontend web e preparar pacote vercel-web
RUN npm run build:web

# ---------------------------------------------------------------------
# Estágio de Execução (Imagem Mínima e Segura)
# ---------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copiar apenas os ficheiros necessários para executar o servidor
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional

COPY server.mjs ./
COPY vercel-api/ ./vercel-api/
COPY --from=builder /app/vercel-web/ ./vercel-web/

# Criar utilizador não-root para segurança ASVS
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.mjs"]
