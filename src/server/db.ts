/**
 * Prisma Client with multi-tenant RLS support (Prisma 7 + PostgreSQL).
 *
 * Architecture:
 * - Prisma 7 requires a driver adapter (@prisma/adapter-pg) — no more datasourceUrl in schema
 * - Every tenant-scoped query runs inside an interactive transaction ($transaction)
 * - SET LOCAL app.current_tenant_id = '<uuid>' is executed first in the transaction
 * - SET LOCAL only lives for the duration of the transaction (safe, no leaks)
 * - PostgreSQL RLS policies filter rows based on current_tenant_id()
 *
 * Two access patterns:
 * 1. withTenant(tenantId, fn) — wraps fn in a transaction with SET LOCAL
 * 2. withAdmin(fn) — wraps fn in a transaction with SET LOCAL ROLE app_admin
 *
 * @see docs/decisions/0001-multi-tenancy-via-rls.md
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
import { logger } from "@/lib/logger";

const uuidSchema = z.string().uuid();

function createPrismaClient() {
  // RUNTIME conecta com APP_DATABASE_URL (role app_login: NAO-superuser, sujeito
  // a RLS) quando disponivel. Isso garante isolamento no nivel do banco — nem um
  // `prisma.<model>` direto vaza, porque a sessao roda como app_user por padrao.
  // Fallback para DATABASE_URL (compatibilidade / ambientes ainda nao migrados;
  // migrations sempre usam DATABASE_URL, que precisa do role privilegiado).
  const connectionString = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("APP_DATABASE_URL or DATABASE_URL environment variable is required");
  }

  // S2 (defesa em profundidade): sem APP_DATABASE_URL em produção, o runtime cai
  // no DATABASE_URL (role privilegiado / BYPASSRLS). Hoje withTenant/withAdmin
  // fazem `SET LOCAL ROLE`, então as rotas seguem isoladas; mas qualquer query
  // `prisma.<modelo_tenant>` crua fora delas vazaria entre tenants. Falha ALTO
  // (logger.error → Sentry em prod) para a misconfiguração não passar silenciosa.
  // (Endurecer para `throw` quando APP_DATABASE_URL estiver confirmado em prod.)
  if (process.env.NODE_ENV === "production" && !process.env.APP_DATABASE_URL) {
    logger.error(
      "APP_DATABASE_URL ausente em produção: runtime usando DATABASE_URL (role privilegiado, RLS bypass em queries cruas). Configure o role app_login (sujeito a RLS).",
    );
  }

  const adapter = new PrismaPg({ connectionString, max: resolvePoolSize() });
  return new PrismaClient({ adapter });
}

/** Teto de conexões do pool. Ver `resolvePoolSize` para o porquê do número. */
const DEFAULT_POOL_SIZE = 25;

/**
 * Quantas conexões o pool pode abrir.
 *
 * Por que isto precisa ser explícito: com o driver adapter do Prisma 7 quem
 * gerencia o pool é o `pg`, cujo default é **10** — e o `connection_limit` da
 * URL, que seria o jeito de ajustar isso no Prisma clássico, é parâmetro do
 * engine e o adapter IGNORA. Sem esta linha o teto fica em 10 e não há string de
 * conexão que mude.
 *
 * Dez é pouco aqui por causa do RLS: `SET LOCAL` só vale dentro de transação,
 * então TODA procedure — inclusive leitura pura — roda em transação interativa e
 * segura uma conexão do começo ao fim (`withTenant`, timeout de 20s). O teto do
 * pool é, na prática, o teto de requisições simultâneas que tocam o banco. Na
 * 11ª, a requisição espera até `maxWait` (10s) e então falha com erro de
 * transação — não com lentidão, que seria o sintoma honesto.
 *
 * 25 sai de: `max_connections` do Postgres em produção é 100, e é preciso deixar
 * folga para migrations, crons, psql de operação e um segundo container durante
 * o deploy. Ajustável por `DATABASE_POOL_MAX` sem novo build.
 */
function resolvePoolSize(): number {
  const raw = process.env.DATABASE_POOL_MAX;
  if (!raw) return DEFAULT_POOL_SIZE;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    logger.warn("DATABASE_POOL_MAX invalido — usando o padrao", {
      valor: raw,
      padrao: DEFAULT_POOL_SIZE,
    });
    return DEFAULT_POOL_SIZE;
  }
  return parsed;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Singleton PrismaClient instance.
 * In development, reuse across hot reloads to avoid exhausting connections.
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Type alias for the transaction client used in withTenant/withAdmin callbacks
type TransactionClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Execute a callback within a tenant-scoped transaction.
 * SET LOCAL ensures the tenant_id is bound to this transaction only — no leak across connections.
 *
 * @example
 * const logs = await withTenant(tenantId, async (tx) => {
 *   return tx.auditLog.findMany();
 * });
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  // Validate UUID format to prevent SQL injection via tenantId interpolation
  const validTenantId = uuidSchema.parse(tenantId);
  return prisma.$transaction(
    async (tx) => {
      // SET ROLE first — app_user is subject to RLS (superuser/owner bypasses it)
      await tx.$executeRawUnsafe(`SET LOCAL ROLE app_user`);
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${validTenantId}'`);
      return fn(tx);
    },
    // Default Prisma timeout (5s) e curto demais para o mutation mais pesado
    // (finalize do PDV: imports dinamicos + loops de itens + upgrades). Sobe o
    // teto para 20s; maxWait 10s evita falha quando o pool esta saturado.
    { timeout: 20_000, maxWait: 10_000 },
  );
}

/**
 * Execute a callback as app_admin (BYPASSRLS).
 * Used for super-admin operations and cross-tenant queries.
 *
 * @example
 * const allLogs = await withAdmin(async (tx) => {
 *   return tx.auditLog.findMany();
 * });
 */
export async function withAdmin<T>(
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE app_admin`);
      return fn(tx);
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}
