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
import { commissionRouter } from "@/server/api/routers/commission";
import { imeiRouter } from "@/server/api/routers/imei";
import { operationRouter } from "@/server/api/routers/operation";
import { adminRouter } from "@/server/api/routers/admin";
import { fiscalRouter } from "@/server/api/routers/fiscal";
import { communicationRouter } from "@/server/api/routers/communication";

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
  commissions: commissionRouter,
  imei: imeiRouter,
  operation: operationRouter,
  admin: adminRouter,
  fiscal: fiscalRouter,
  communication: communicationRouter,
});

export type AppRouter = typeof appRouter;
