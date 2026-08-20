# syntax=docker/dockerfile:1

# ---------- deps ----------
# node:alpine (musl) nas 3 etapas de propósito: o binário nativo do Prisma
# Query Engine gerado em "builder" precisa casar com a libc do runtime — se
# builder fosse glibc (node:20 comum) e runner fosse alpine (musl), o
# binário certo não estaria presente e o app quebraria só em produção.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# prisma/ e scripts/ ANTES do npm ci: o postinstall (`prisma generate &&
# node scripts/verify-prisma-engine.cjs`) precisa dos dois pra rodar — sem
# eles o postinstall falha ("Could not find Prisma Schema" ou
# "Cannot find module .../verify-prisma-engine.cjs") e quebra o npm ci
# inteiro (erros reais vistos na pipeline, não só avisos).
COPY prisma ./prisma
COPY scripts ./scripts
RUN npm ci

# ---------- build ----------
FROM node:20-alpine AS builder
WORKDIR /app
# Sem isso, "next build" tenta mandar telemetria anônima pra um endpoint
# externo em build-time -- no Docker-in-Docker da Golden Pipeline (rede
# mais restrita que o step "Build Application", que roda o mesmo comando
# fora do Docker) essa chamada pode ficar tentando indefinidamente sem erro
# claro (mesma classe de problema que já travou a fonte do Google Fonts).
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NÃO roda `prisma generate` de novo aqui: o client já veio corretamente
# gerado dentro de node_modules/.prisma (via postinstall do "deps", que
# tem preinstall/openssl) — regenerar aqui rodaria num node:20-alpine
# limpo, SEM openssl (nenhum preinstall roda de novo neste estágio), e
# arriscaria sobrescrever o client bom com um gerado com detecção de
# libssl falha (mesmo bug que já mordeu essa pipeline mais de uma vez).
RUN npm run build

# ---------- runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# output: standalone (next.config.js) — só os arquivos/node_modules de fato
# usados em produção, bem menor que copiar node_modules/ inteiro.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
