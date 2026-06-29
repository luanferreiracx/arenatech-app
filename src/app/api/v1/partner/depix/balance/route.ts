import { NextRequest } from "next/server";
import { withPartnerAuth } from "@/lib/partner-api/with-partner-auth";
import { PARTNER_SCOPES } from "@/lib/partner-api/scopes";
import { getPartnerBalance } from "@/server/services/partner-depix.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/partner/depix/balance — saldo DePix do tenant. Escopo depix:read.
 */
export async function GET(req: NextRequest) {
  const auth = await withPartnerAuth(req, { scope: PARTNER_SCOPES.DEPIX_READ });
  if (auth instanceof Response) return auth;

  const balance = await getPartnerBalance(auth.tenantId);
  return Response.json(balance);
}
