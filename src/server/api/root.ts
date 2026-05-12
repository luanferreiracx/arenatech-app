import { createTRPCRouter } from "@/server/api/trpc";
import { authRouter } from "@/server/api/routers/auth";
import { catalogRouter } from "@/server/api/routers/catalog";
import { customerRouter } from "@/server/api/routers/customer";
import { stockRouter } from "@/server/api/routers/stock";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  catalog: catalogRouter,
  customer: customerRouter,
  stock: stockRouter,
});

export type AppRouter = typeof appRouter;
