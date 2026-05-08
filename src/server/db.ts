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

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
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
  return prisma.$transaction(async (tx) => {
    // SET ROLE first — app_user is subject to RLS (superuser/owner bypasses it)
    await tx.$executeRawUnsafe(`SET LOCAL ROLE app_user`);
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
    return fn(tx);
  });
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
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE app_admin`);
    return fn(tx);
  });
}
