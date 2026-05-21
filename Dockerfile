# syntax=docker/dockerfile:1.7
# BuildKit syntax: habilita cache mounts (--mount=type=cache) p/ pnpm store
# e .next/cache, reduzindo rebuilds de minutos para segundos.

# ============================================================
# Stage 1: Dependencies
# ============================================================
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.0.8 --activate

COPY package.json pnpm-lock.yaml .npmrc* ./

# Cache mount no pnpm store: pacotes baixados viram cache layer.
# Quando pnpm-lock.yaml nao muda, install termina em segundos.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

RUN pnpm approve-builds prisma @prisma/engines esbuild sharp unrs-resolver 2>/dev/null || true
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm rebuild

# ============================================================
# Stage 2: Build
# ============================================================
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.0.8 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm prisma generate

# Cache mount no .next/cache: webpack/turbopack reaproveita modulos compilados.
RUN --mount=type=cache,id=next-cache,target=/app/.next/cache \
    pnpm build

# ============================================================
# Stage 3: Production runtime
# ============================================================
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Prisma CLI + deps em pasta isolada (/opt/prisma) para nao colidir com o
# standalone que tem package.json proprio + pnpm packageManager.
# Resultado: ~270MB nesse layer (vs ~1GB do node_modules completo).
# IMPORTANTE: chown na mesma layer p/ nao duplicar o tamanho da imagem!
WORKDIR /opt/prisma
# Prisma 7 inclui Studio (chart.js, react-dom, etc) por default mesmo em prod.
# Tentamos remover mas studio-core e require'd pelo prisma CLI internamente.
# Limpeza minima: source maps e markdown (sem quebrar deps).
RUN npm init -y >/dev/null \
    && npm install --no-save --no-audit --no-fund --omit=dev --omit=optional \
       prisma@7.8.0 @prisma/adapter-pg@7.8.0 tsx@4.20.3 dotenv@17.4.2 \
    && find node_modules -name "*.md" -delete 2>/dev/null || true \
    && find node_modules -name "*.map" -delete 2>/dev/null || true \
    && find node_modules -name "*.d.ts" -delete 2>/dev/null || true \
    && npm cache clean --force \
    && chown -R nextjs:nodejs /opt/prisma
WORKDIR /app

# Standalone output: server.js + ~42MB de node_modules essencial.
# --chown evita duplicar layer com chown posterior.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Schema Prisma + config para `migrate deploy` em runtime
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

# PATH para `npx prisma` resolver + NODE_PATH para imports do prisma.config.ts
ENV PATH="/opt/prisma/node_modules/.bin:${PATH}"
ENV NODE_PATH="/opt/prisma/node_modules"

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
