import { NextRequest } from "next/server";
import { withPartnerAuth } from "@/lib/partner-api/with-partner-auth";
import { PARTNER_SCOPES } from "@/lib/partner-api/scopes";
import { getPartnerTransaction } from "@/server/services/partner-depix.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/partner/depix/transactions/:id — detalhe de uma transação do tenant.
 * Escopo depix:read. 404 se não existir (ou for de outro tenant — RLS isola).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await withPartnerAuth(req, { scope: PARTNER_SCOPES.DEPIX_READ });
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const tx = await getPartnerTransaction(auth.tenantId, id);
  if (!tx) {
    return Response.json({ error: "not_found", message: "Transação não encontrada" }, { status: 404 });
  }
  return Response.json(tx);
}
