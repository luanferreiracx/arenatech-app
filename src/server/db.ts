/**
 * Prisma Client with multi-tenant RLS support.
 *
 * Architecture (Prisma 7 + PostgreSQL RLS):
 *
 * - Every tenant-scoped query runs inside an interactive transaction ($transaction)
 * - SET LOCAL app.current_tenant_id = '<uuid>' is executed first in the transaction
 * - SET LOCAL only lives for the duration of the transaction (safe, no leaks)
 * - PostgreSQL RLS policies filter rows based on current_tenant_id()
 *
 * Two access patterns:
 * 1. Tenant-scoped: getTenantDb(tenantId) — returns helpers that wrap every operation in a transaction with SET LOCAL
 * 2. Admin (bypass RLS): getAdminDb() — uses SET ROLE app_admin to bypass RLS
 *
 * @see docs/decisions/0001-multi-tenancy-via-rls.md
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Singleton PrismaClient instance.
 * In development, reuse across hot reloads to avoid exhausting connections.
 */
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

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
  fn: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
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
  fn: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE app_admin`);
    return fn(tx);
  });
}
