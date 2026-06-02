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

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
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
