import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const authRouter = createTRPCRouter({
  /** Return current session info */
  me: protectedProcedure.query(({ ctx }) => {
    return {
      user: ctx.session.user,
      activeTenantId: ctx.session.activeTenantId,
      availableTenants: ctx.session.availableTenants,
    };
  }),

  /** Validate that user has access to the given tenant.
   *  Actual JWT update is done via NextAuth's update() on the client side.
   *  This procedure just validates the tenant access.
   */
  validateTenantAccess: protectedProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      const hasTenant = ctx.session.availableTenants.some(
        (t) => t.id === input.tenantId,
      );
      if (!hasTenant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied to this tenant",
        });
      }
      return { success: true, tenantId: input.tenantId };
    }),
});
