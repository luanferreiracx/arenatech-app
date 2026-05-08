import { createTRPCRouter } from "@/server/api/trpc";
import { exampleRouter } from "@/server/api/routers/example";
import { authRouter } from "@/server/api/routers/auth";

export const appRouter = createTRPCRouter({
  example: exampleRouter,
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
