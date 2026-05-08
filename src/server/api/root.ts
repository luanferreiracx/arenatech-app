import { createTRPCRouter } from "@/server/api/trpc";
import { exampleRouter } from "@/server/api/routers/example";
import { authRouter } from "@/server/api/routers/auth";
import { settingsRouter } from "@/server/api/routers/settings";
import { catalogRouter } from "@/server/api/routers/catalog";
import { customerRouter } from "@/server/api/routers/customer";
import { stockRouter } from "@/server/api/routers/stock";
import { cashierRouter } from "@/server/api/routers/cashier";
import { financialRouter } from "@/server/api/routers/financial";
import { serviceOrderRouter } from "@/server/api/routers/service-order";
import { saleRouter } from "@/server/api/routers/sale";

export const appRouter = createTRPCRouter({
  example: exampleRouter,
  auth: authRouter,
  settings: settingsRouter,
  catalog: catalogRouter,
  customers: customerRouter,
  stock: stockRouter,
  cashier: cashierRouter,
  financial: financialRouter,
  serviceOrders: serviceOrderRouter,
  sales: saleRouter,
});

export type AppRouter = typeof appRouter;
