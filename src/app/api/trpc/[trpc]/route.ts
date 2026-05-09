import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";

import { createTRPCContext } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { logger } from "@/lib/logger";

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
    onError: ({ path, error }) => {
      logger.error("tRPC error", {
        code: error.code,
        path: path ?? "<no-path>",
        message: error.message,
        ...(process.env.NODE_ENV === "development"
          ? { stack: error.stack }
          : {}),
      });
    },
  });

export { handler as GET, handler as POST };
