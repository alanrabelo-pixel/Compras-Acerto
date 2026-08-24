# syntax=docker/dockerfile:1

# node:alpine (musl) em todos os estagios -- o binario nativo do Prisma
# Query Engine gerado em "builder" precisa casar com a libc do "runner".
FROM node:20-alpine AS base
# openssl: Prisma detecta a versao do libssl em runtime pra escolher o
# engine musl certo. Sem isso cai num fallback linkado pra libssl 1.1, que
# nao existe mais no Alpine atual -> "Error loading shared library
# libssl.so.1.1". Um stage base evita repetir isso em cada estagio.
RUN apk add --no-cache openssl

# ---------- deps ----------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# prisma/ e scripts/ antes do npm ci: o postinstall (prisma generate +
# verify-prisma-engine.cjs) precisa dos dois.
COPY prisma ./prisma
COPY scripts ./scripts
RUN npm ci

# ---------- build ----------
FROM base AS builder
WORKDIR /app
# Evita que "next build" tente telemetria em build-time (rede restrita do
# Docker-in-Docker da golden pipeline trava sem erro claro).
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Nao roda `prisma generate` de novo aqui -- usa o client ja gerado em "deps".
RUN npm run build

# ---------- runtime ----------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# output: standalone (next.config.js) -- so os arquivos/node_modules
# realmente usados em produção.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
