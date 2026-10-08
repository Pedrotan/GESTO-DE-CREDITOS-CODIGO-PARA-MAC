# =====================================================================
# Tango Gestão e Créditos ERP - Dockerfile de Produção para VPS
# =====================================================================

FROM node:22-alpine AS builder

WORKDIR /app

# Instalar ferramentas para compilação caso necessário
RUN apk add --no-cache python3 make g++

COPY package*.json ./

# Instalar dependências sem disparar scripts de Electron desktop
RUN npm ci --ignore-scripts

COPY . .

# Compilar frontend web (Vite)
RUN npm run build:web

# ---------------------------------------------------------------------
# Estágio de Execução (Imagem Mínima e Segura)
# ---------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copiar dependências de produção sem disparar scripts de desktop
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts

COPY server.mjs ./
COPY vercel-api/ ./vercel-api/
COPY --from=builder /app/vercel-web/ ./vercel-web/

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.mjs"]
