# syntax=docker/dockerfile:1

# ---------- deps ----------
# node:alpine (musl) nas 3 etapas de propósito: o binário nativo do Prisma
# Query Engine gerado em "builder" precisa casar com a libc do runtime — se
# builder fosse glibc (node:20 comum) e runner fosse alpine (musl), o
# binário certo não estaria presente e o app quebraria só em produção.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- build ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# prisma generate já roda no postinstall do "npm ci" acima, mas o schema
# pode ter sido copiado depois (COPY . .) — gera de novo por garantia, é
# barato e idempotente.
RUN npx prisma generate
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
