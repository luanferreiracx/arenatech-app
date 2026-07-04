import { NextRequest } from "next/server";
import { withPartnerAuth } from "@/lib/partner-api/with-partner-auth";
import { TRANSACTION_READ_SCOPES } from "@/lib/partner-api/scopes";
import { getPartnerTransaction } from "@/server/services/partner-depix.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/partner/depix/transactions/:id — status/detalhe de UMA transação do
 * tenant (o depósito/saque que o parceiro criou). Autoriza com a key de depósito OU
 * de saque (any-of). 404 se não existir (ou for de outro tenant — RLS isola).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await withPartnerAuth(req, { scope: TRANSACTION_READ_SCOPES });
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const tx = await getPartnerTransaction(auth.tenantId, id);
  if (!tx) {
    return Response.json({ error: "not_found", message: "Transação não encontrada" }, { status: 404 });
  }
  return Response.json(tx);
}
