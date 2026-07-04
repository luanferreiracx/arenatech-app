/**
 * withPartnerAuth (ADR 0057): 401 sem/inv key, 403 sem escopo, 429 acima da
 * quota, 503 fail-closed (sem backend de rate-limit em prod), e contexto ok.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const validatePartnerApiKey = vi.fn();
const rateLimit = vi.fn();
const hasDistributedRateLimit = vi.fn();

vi.mock("@/server/services/partner-api-key.service", () => ({
  validatePartnerApiKey: (...a: unknown[]) => validatePartnerApiKey(...a),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...a: unknown[]) => rateLimit(...a),
  hasDistributedRateLimit: (...a: unknown[]) => hasDistributedRateLimit(...a),
}));

import { withPartnerAuth } from "@/lib/partner-api/with-partner-auth";
import { PARTNER_SCOPES } from "@/lib/partner-api/scopes";

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://x/api/v1/partner/depix/deposits", { headers });
}

beforeEach(() => {
  validatePartnerApiKey.mockReset();
  rateLimit.mockReset();
  hasDistributedRateLimit.mockReset();
  hasDistributedRateLimit.mockReturnValue(true);
  rateLimit.mockResolvedValue({ success: true, remaining: 59, reset: Date.now() + 60000 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("withPartnerAuth", () => {
  it("401 sem Authorization", async () => {
    const r = await withPartnerAuth(req(), { scope: PARTNER_SCOPES.DEPIX_DEPOSIT });
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).status).toBe(401);
  });

  it("401 key invalida", async () => {
    validatePartnerApiKey.mockResolvedValue(null);
    const r = await withPartnerAuth(req({ authorization: "Bearer at_xxx_yyy" }), { scope: PARTNER_SCOPES.DEPIX_DEPOSIT });
    expect((r as Response).status).toBe(401);
  });

  it("403 sem o escopo exigido", async () => {
    validatePartnerApiKey.mockResolvedValue({
      tenantId: "t1", keyId: "k1", keyPrefix: "abcd1234", scopes: ["depix:deposit"],
    });
    const r = await withPartnerAuth(req({ authorization: "Bearer at_x_y" }), { scope: PARTNER_SCOPES.DEPIX_WITHDRAW });
    expect((r as Response).status).toBe(403);
  });

  it("any-of: status aceita a key de depósito OU de saque", async () => {
    validatePartnerApiKey.mockResolvedValue({
      tenantId: "t1", keyId: "k1", keyPrefix: "abcd1234", scopes: ["depix:withdraw"],
    });
    const r = await withPartnerAuth(req({ authorization: "Bearer at_x_y" }), {
      scope: [PARTNER_SCOPES.DEPIX_DEPOSIT, PARTNER_SCOPES.DEPIX_WITHDRAW],
    });
    expect(r).not.toBeInstanceOf(Response); // tem withdraw -> passa
  });

  it("any-of: 403 se a key não tem NENHUM dos escopos", async () => {
    validatePartnerApiKey.mockResolvedValue({
      tenantId: "t1", keyId: "k1", keyPrefix: "abcd1234", scopes: [],
    });
    const r = await withPartnerAuth(req({ authorization: "Bearer at_x_y" }), {
      scope: [PARTNER_SCOPES.DEPIX_DEPOSIT, PARTNER_SCOPES.DEPIX_WITHDRAW],
    });
    expect((r as Response).status).toBe(403);
  });

  it("429 acima da quota", async () => {
    validatePartnerApiKey.mockResolvedValue({
      tenantId: "t1", keyId: "k1", keyPrefix: "abcd1234", scopes: ["depix:deposit"],
    });
    rateLimit.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 60000 });
    const r = await withPartnerAuth(req({ authorization: "Bearer at_x_y" }), { scope: PARTNER_SCOPES.DEPIX_DEPOSIT });
    expect((r as Response).status).toBe(429);
  });

  it("503 fail-closed: prod sem backend de rate-limit", async () => {
    vi.stubEnv("NODE_ENV", "production");
    hasDistributedRateLimit.mockReturnValue(false);
    validatePartnerApiKey.mockResolvedValue({
      tenantId: "t1", keyId: "k1", keyPrefix: "abcd1234", scopes: ["depix:deposit"],
    });
    const r = await withPartnerAuth(req({ authorization: "Bearer at_x_y" }), { scope: PARTNER_SCOPES.DEPIX_DEPOSIT });
    expect((r as Response).status).toBe(503);
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it("ok: retorna o contexto do parceiro (tenant+scopes)", async () => {
    validatePartnerApiKey.mockResolvedValue({
      tenantId: "t1", keyId: "k1", keyPrefix: "abcd1234", scopes: ["depix:deposit", "depix:withdraw"],
    });
    const r = await withPartnerAuth(req({ authorization: "Bearer at_x_y" }), { scope: PARTNER_SCOPES.DEPIX_DEPOSIT });
    expect(r).not.toBeInstanceOf(Response);
    expect(r).toMatchObject({ tenantId: "t1", keyPrefix: "abcd1234" });
    // rate-limit por key+escopo.
    expect(rateLimit.mock.calls[0]![0]).toMatchObject({ key: "partner:abcd1234:depix:deposit" });
  });
});
