import { z } from "zod";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";

/**
 * Busca global para o command palette (⌘K) — resolve cliente, OS e produto por
 * um termo, com deep-link direto ao detalhe. Cada grupo é limitado (a paleta é
 * um atalho, não uma listagem). O chamador passa `types` conforme os módulos que
 * o tenant tem (evita buscar o que a UI nem mostraria).
 */
const RESULT_LIMIT = 6;

const SearchType = z.enum(["customers", "serviceOrders", "products"]);

export const searchRouter = createTRPCRouter({
  global: tenantProcedure
    .input(
      z.object({
        term: z.string().trim().min(2).max(100),
        types: z.array(SearchType).min(1).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const term = input.term.trim();
      const wanted = new Set(input.types ?? ["customers", "serviceOrders", "products"]);
      const digits = term.replace(/\D/g, "");
      const insensitive = { contains: term, mode: "insensitive" } as const;

      return ctx.withTenant(async (tx) => {
        const [customers, orders, products] = await Promise.all([
          wanted.has("customers")
            ? tx.customer.findMany({
                where: {
                  deletedAt: null,
                  OR: [
                    { name: insensitive },
                    ...(digits.length >= 3
                      ? [{ cpf: { contains: digits } }, { phone: { contains: digits } }]
                      : []),
                  ],
                },
                select: { id: true, name: true, cpf: true, phone: true },
                take: RESULT_LIMIT,
                orderBy: { name: "asc" },
              })
            : Promise.resolve([]),
          // ServiceOrder não tem relação Prisma navegável p/ Customer (só o FK
          // escalar customerId) — buscamos por número/modelo e resolvemos o nome
          // do cliente num 2º lote abaixo.
          wanted.has("serviceOrders")
            ? tx.serviceOrder.findMany({
                where: {
                  deletedAt: null,
                  OR: [{ number: insensitive }, { deviceModel: insensitive }],
                },
                select: {
                  id: true,
                  number: true,
                  status: true,
                  deviceBrand: true,
                  deviceModel: true,
                  customerId: true,
                },
                take: RESULT_LIMIT,
                orderBy: { createdAt: "desc" },
              })
            : Promise.resolve([]),
          wanted.has("products")
            ? tx.product.findMany({
                where: {
                  deletedAt: null,
                  OR: [
                    { name: insensitive },
                    { sku: insensitive },
                    { barcode: { contains: term } },
                  ],
                },
                select: { id: true, name: true, sku: true },
                take: RESULT_LIMIT,
                orderBy: { name: "asc" },
              })
            : Promise.resolve([]),
        ]);

        // Nomes dos clientes das OS encontradas (1 query, sem N+1).
        const customerIds = [...new Set(orders.map((o) => o.customerId))];
        const orderCustomers = customerIds.length
          ? await tx.customer.findMany({
              where: { id: { in: customerIds } },
              select: { id: true, name: true },
            })
          : [];
        const customerNameById = new Map(orderCustomers.map((c) => [c.id, c.name]));

        return {
          customers: customers.map((c) => ({
            id: c.id,
            name: c.name,
            subtitle: c.cpf ?? c.phone ?? null,
          })),
          serviceOrders: orders.map((o) => ({
            id: o.id,
            number: o.number,
            status: o.status,
            customerName: customerNameById.get(o.customerId) ?? null,
            device: [o.deviceBrand, o.deviceModel].filter(Boolean).join(" ") || null,
          })),
          products: products.map((p) => ({ id: p.id, name: p.name, sku: p.sku })),
        };
      });
    }),
});
