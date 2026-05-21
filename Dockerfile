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

# Standalone output: server.js + minimal node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma artifacts para `prisma migrate deploy` rodar em runtime
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
