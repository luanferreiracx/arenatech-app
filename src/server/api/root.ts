import { createTRPCRouter } from "@/server/api/trpc";
import { authRouter } from "@/server/api/routers/auth";
import { cashierRouter } from "@/server/api/routers/cashier";
import { catalogRouter } from "@/server/api/routers/catalog";
import { customerRouter } from "@/server/api/routers/customer";
import { stockRouter } from "@/server/api/routers/stock";
import { settingsRouter } from "@/server/api/routers/settings";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  cashier: cashierRouter,
  catalog: catalogRouter,
  customer: customerRouter,
  stock: stockRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
