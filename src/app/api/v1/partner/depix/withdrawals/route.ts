import { NextRequest } from "next/server";
import { partnerErrorResponse, withPartnerAuth } from "@/lib/partner-api/with-partner-auth";
import { PARTNER_SCOPES } from "@/lib/partner-api/scopes";
import { partnerWithdrawSchema } from "@/lib/partner-api/write-schemas";
import { partnerCreateWithdraw } from "@/server/services/partner-depix-write.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/partner/depix/withdrawals — saque PIX ou on-chain. Escopo
 * depix:withdraw. SEM 2FA (parceiro é máquina) — mas mantém cap diário (painel +
 * API), advisory lock e cross-check; só carteira CUSTODIAL. Idempotency-Key + 10/min.
 */
export async function POST(req: NextRequest) {
  const auth = await withPartnerAuth(req, {
    scope: PARTNER_SCOPES.DEPIX_WITHDRAW,
    ratePerMinute: 10,
  });
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request", message: "Corpo JSON inválido" }, { status: 400 });
  }
  const parsed = partnerWithdrawSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "validation", message: parsed.error.issues[0]?.message ?? "Entrada inválida" },
      { status: 422 },
    );
  }

  try {
    const result = await partnerCreateWithdraw({
      tenantId: auth.tenantId,
      keyPrefix: auth.keyPrefix,
      input: parsed.data,
      idempotencyKey: req.headers.get("idempotency-key"),
    });
    return Response.json(result, { status: 201 });
  } catch (err) {
    return partnerErrorResponse(err, auth.keyPrefix);
  }
}
