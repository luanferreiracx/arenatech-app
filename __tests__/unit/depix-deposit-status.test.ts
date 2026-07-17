/**
 * getPixStatus (GET /deposit-status): normalizacao dos status Eulen no POLLING
 * (reconcile / checkTransactionStatus). Regressao do delay de 24h: `delayed` = PIX
 * recebido -> `pix_received` (libera a venda; NAO credita saldo). `fetch` mockado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getPixStatus } from "@/lib/services/depix-service";

const ORIGINAL_KEY = process.env.DEPIX_API_KEY;

function mockStatus(raw: string) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ response: { status: raw } }), { status: 200 }),
  );
}

beforeEach(() => {
  process.env.DEPIX_API_KEY = "jwt-test";
  vi.restoreAllMocks();
});
afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.DEPIX_API_KEY;
  else process.env.DEPIX_API_KEY = ORIGINAL_KEY;
});

describe("getPixStatus — normalizacao de status (delay 24h)", () => {
  it("delayed: PIX recebido -> pix_received (NAO final: o DePix ainda vai on-chain)", async () => {
    mockStatus("delayed");
    const res = await getPixStatus("q-delayed");
    expect(res).toMatchObject({ success: true, status: "pix_received", isFinal: false });
  });

  it("approved: pix_received (inalterado)", async () => {
    mockStatus("approved");
    expect(await getPixStatus("q1")).toMatchObject({ status: "pix_received", isFinal: false });
  });

  it("depix_sent: paid (creditavel, final)", async () => {
    mockStatus("depix_sent");
    expect(await getPixStatus("q2")).toMatchObject({ status: "paid", isFinal: true });
  });

  it("under_review: continua pending (a Eulen ainda revisa — nao libera venda)", async () => {
    mockStatus("under_review");
    expect(await getPixStatus("q3")).toMatchObject({ status: "pending", isFinal: false });
  });

  it("pending: pending", async () => {
    mockStatus("pending");
    expect(await getPixStatus("q4")).toMatchObject({ status: "pending" });
  });

  it("refunded: refunded (final)", async () => {
    mockStatus("refunded");
    expect(await getPixStatus("q5")).toMatchObject({ status: "refunded", isFinal: true });
  });
});
