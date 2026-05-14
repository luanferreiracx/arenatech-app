import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { nfReportSchema } from "@/lib/validators/report";
import type { NfReportLine, NfReportTotals } from "@/lib/validators/report";

export const reportRouter = createTRPCRouter({
  nfReport: tenantProcedure
    .input(nfReportSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const dateFrom = new Date(input.dateFrom);
        const dateTo = new Date(input.dateTo + "T23:59:59.999Z");

        // Fetch sales in period
        const sales = await tx.sale.findMany({
          where: {
            status: "COMPLETED",
            createdAt: { gte: dateFrom, lte: dateTo },
          },
          select: {
            id: true,
            number: true,
            createdAt: true,
            totalAmount: true,
            customerId: true,
          },
          orderBy: { createdAt: "desc" },
        });

        // Fetch service orders in period (paid)
        const orders = await tx.serviceOrder.findMany({
          where: {
            status: { in: ["COMPLETED", "DELIVERED"] },
            paymentDate: { gte: dateFrom, lte: dateTo },
          },
          select: {
            id: true,
            number: true,
            paymentDate: true,
            totalAmount: true,
            nfseIssued: true,
            nfseNumber: true,
            customerId: true,
          },
          orderBy: { paymentDate: "desc" },
        });

        // Fetch customer names
        const allCustomerIds = [
          ...sales.map((s) => s.customerId).filter(Boolean),
          ...orders.map((o) => o.customerId),
        ] as string[];
        const uniqueCustomerIds = [...new Set(allCustomerIds)];
        const customers = uniqueCustomerIds.length > 0
          ? await tx.customer.findMany({
              where: { id: { in: uniqueCustomerIds } },
              select: { id: true, name: true },
            })
          : [];
        const customerMap = new Map(customers.map((c) => [c.id, c.name]));

        // Fetch invoices to cross-reference
        const invoicesBySale = await tx.invoice.findMany({
          where: {
            referenceType: "SALE",
            referenceId: { in: sales.map((s) => s.id) },
            status: { not: "CANCELLED" },
          },
          select: { referenceId: true, type: true, number: true },
        });
        const invoiceMapSale = new Map<string, { type: string; number: string | number | null }>();
        for (const inv of invoicesBySale) {
          if (inv.referenceId) invoiceMapSale.set(inv.referenceId, { type: inv.type, number: inv.number });
        }

        const invoicesByOs = await tx.invoice.findMany({
          where: {
            referenceType: "SERVICE_ORDER",
            referenceId: { in: orders.map((o) => o.id) },
            status: { not: "CANCELLED" },
          },
          select: { referenceId: true, type: true, number: true },
        });
        const invoiceMapOs = new Map<string, { type: string; number: string | number | null }>();
        for (const inv of invoicesByOs) {
          if (inv.referenceId) invoiceMapOs.set(inv.referenceId, { type: inv.type, number: inv.number });
        }

        // Build lines
        const lines: NfReportLine[] = [];

        for (const s of sales) {
          const inv = invoiceMapSale.get(s.id);
          const hasNf = !!inv;
          lines.push({
            type: "SALE",
            doc: s.number,
            date: s.createdAt.toLocaleDateString("pt-BR"),
            customer: (s.customerId ? customerMap.get(s.customerId) : null) ?? "Consumidor",
            value: Number(s.totalAmount),
            hasNf,
            nfType: inv?.type ?? null,
            nfNumber: inv?.number ?? null,
          });
        }

        for (const o of orders) {
          const inv = invoiceMapOs.get(o.id);
          const hasNf = !!inv || !!o.nfseIssued;
          lines.push({
            type: "SERVICE_ORDER",
            doc: o.number,
            date: o.paymentDate?.toLocaleDateString("pt-BR") ?? "-",
            customer: customerMap.get(o.customerId) ?? "Consumidor",
            value: Number(o.totalAmount),
            hasNf,
            nfType: inv?.type ?? (o.nfseIssued ? "NFS-e" : null),
            nfNumber: inv?.number ?? o.nfseNumber ?? null,
          });
        }

        // Filter by NF status
        let filtered = lines;
        if (input.nfStatus === "with_nf") {
          filtered = lines.filter((l) => l.hasNf);
        } else if (input.nfStatus === "without_nf") {
          filtered = lines.filter((l) => !l.hasNf);
        }

        // Calculate totals
        const salesLines = lines.filter((l) => l.type === "SALE");
        const osLines = lines.filter((l) => l.type === "SERVICE_ORDER");

        const totals: NfReportTotals = {
          salesTotal: salesLines.length,
          salesWithoutNf: salesLines.filter((l) => !l.hasNf).length,
          osTotal: osLines.length,
          osWithoutNf: osLines.filter((l) => !l.hasNf).length,
          valueTotal: lines.reduce((sum, l) => sum + l.value, 0),
          valueWithoutNf: lines.filter((l) => !l.hasNf).reduce((sum, l) => sum + l.value, 0),
        };

        return { lines: filtered, totals };
      });
    }),
});
