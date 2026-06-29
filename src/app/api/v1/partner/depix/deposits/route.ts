import { NextRequest } from "next/server";
import { partnerErrorResponse, withPartnerAuth } from "@/lib/partner-api/with-partner-auth";
import { PARTNER_SCOPES } from "@/lib/partner-api/scopes";
import { partnerDepositSchema } from "@/lib/partner-api/write-schemas";
import { partnerCreateDeposit } from "@/server/services/partner-depix-write.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/partner/depix/deposits — cria um depósito (gera QR PIX). Escopo
 * depix:deposit. Aceita header Idempotency-Key. 30 req/min por key.
 */
export async function POST(req: NextRequest) {
  const auth = await withPartnerAuth(req, {
    scope: PARTNER_SCOPES.DEPIX_DEPOSIT,
    ratePerMinute: 30,
  });
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request", message: "Corpo JSON inválido" }, { status: 400 });
  }
  const parsed = partnerDepositSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "validation", message: parsed.error.issues[0]?.message ?? "Entrada inválida" },
      { status: 422 },
    );
  }

  try {
    const result = await partnerCreateDeposit({
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
