import { createTRPCRouter } from "@/server/api/trpc";
import { exampleRouter } from "@/server/api/routers/example";
import { authRouter } from "@/server/api/routers/auth";
import { settingsRouter } from "@/server/api/routers/settings";
import { catalogRouter } from "@/server/api/routers/catalog";
import { customerRouter } from "@/server/api/routers/customer";

export const appRouter = createTRPCRouter({
  example: exampleRouter,
  auth: authRouter,
  settings: settingsRouter,
  catalog: catalogRouter,
  customers: customerRouter,
});

export type AppRouter = typeof appRouter;
