/**
 * POST /api/webhooks/eulen: nunca devolve 4xx pra Eulen quando o corpo passou na
 * auth — handler 4xx (ex.: QR estatico sem qrId) e JSON invalido viram ACK 200 +
 * log do corpo cru. Isso para o alerta de erro no Bot da Eulen e captura o
 * formato real. Auth invalida segue 401/503.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const handleDeposit = vi.fn();
const handleWithdraw = vi.fn();
const handleMed = vi.fn();

vi.mock("@/lib/webhooks/eulen-deposit-handler", () => ({
  handleEulenDepositWebhook: (...a: unknown[]) => handleDeposit(...a),
}));
vi.mock("@/lib/webhooks/eulen-withdraw-handler", () => ({
  handleEulenWithdrawWebhook: (...a: unknown[]) => handleWithdraw(...a),
}));
vi.mock("@/lib/webhooks/eulen-med-handler", () => ({
  handleEulenMedWebhook: (...a: unknown[]) => handleMed(...a),
}));
vi.mock("@/lib/webhooks/eulen-auth", () => ({
  verifyEulenWebhookAuth: () => ({ ok: true }),
}));
vi.mock("@/lib/webhooks/replay-guard", () => ({
  extractSourceIp: () => null,
}));

import { POST } from "@/app/api/webhooks/eulen/route";

function req(body: string) {
  return new Request("https://x/api/webhooks/eulen", {
    method: "POST",
    headers: { authorization: "Basic x", "content-type": "application/json" },
    body,
  }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  for (const m of [handleDeposit, handleWithdraw, handleMed]) m.mockReset();
});

describe("POST /api/webhooks/eulen", () => {
  it("deposit OK -> repassa status/body do handler", async () => {
    handleDeposit.mockResolvedValue({ status: 200, body: { ok: true, pixApproved: true } });
    const res = await POST(req(JSON.stringify({ webhookType: "deposit", qrId: "q", status: "approved" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ pixApproved: true });
  });

  it("handler 400 (ex.: QR estatico sem qrId) -> ACK 200 (nao 400)", async () => {
    handleDeposit.mockResolvedValue({ status: 400, body: { error: "missing qrId" } });
    const res = await POST(req(JSON.stringify({ webhookType: "deposit" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ acked: true });
  });

  it("JSON invalido -> 200 ignored (nao 400)", async () => {
    const res = await POST(req("isto nao e json"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: "invalid_json" });
  });

  it("webhookType desconhecido -> 200 ignored", async () => {
    const res = await POST(req(JSON.stringify({ foo: "bar" })));
    expect(res.status).toBe(200);
    expect(handleDeposit).not.toHaveBeenCalled();
  });
});
