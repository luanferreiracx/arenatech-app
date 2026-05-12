import { createTRPCRouter } from "@/server/api/trpc";
import { authRouter } from "@/server/api/routers/auth";
import { customerRouter } from "@/server/api/routers/customer";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  customer: customerRouter,
});

export type AppRouter = typeof appRouter;
