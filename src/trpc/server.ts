import { createCallerFactory, createTRPCContext } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { headers } from "next/headers";

/**
 * Server-side tRPC caller — usa em Server Components e Server Actions
 *
 * @example
 * const { message } = await trpc.example.hello();
 */
const createCaller = createCallerFactory(appRouter);

export const trpc = createCaller(async () => {
  return createTRPCContext({ headers: await headers() });
});
