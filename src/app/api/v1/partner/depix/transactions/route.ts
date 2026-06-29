import { NextRequest } from "next/server";
import { withPartnerAuth } from "@/lib/partner-api/with-partner-auth";
import { PARTNER_SCOPES } from "@/lib/partner-api/scopes";
import { listPartnerTransactions } from "@/server/services/partner-depix.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/partner/depix/transactions — extrato paginado. Escopo depix:read.
 * Query: page (0-based), pageSize (<=100), kind (DEPOSIT|WITHDRAW), status.
 */
export async function GET(req: NextRequest) {
  const auth = await withPartnerAuth(req, { scope: PARTNER_SCOPES.DEPIX_READ });
  if (auth instanceof Response) return auth;

  const sp = req.nextUrl.searchParams;
  const kindRaw = sp.get("kind");
  const kind = kindRaw === "DEPOSIT" || kindRaw === "WITHDRAW" ? kindRaw : undefined;

  const result = await listPartnerTransactions(auth.tenantId, {
    page: sp.get("page") ? Number(sp.get("page")) : undefined,
    pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : undefined,
    kind,
    status: sp.get("status") ?? undefined,
  });
  return Response.json(result);
}
