/**
 * listEulenDeposits (GET /deposits): parseia o array compacto do extrato Eulen
 * e trata erro HTTP / resposta nao-array. `fetch` mockado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listEulenDeposits } from "@/lib/services/depix-service";

const ORIGINAL_KEY = process.env.DEPIX_API_KEY;

beforeEach(() => {
  process.env.DEPIX_API_KEY = "jwt-test";
  vi.restoreAllMocks();
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.DEPIX_API_KEY;
  else process.env.DEPIX_API_KEY = ORIGINAL_KEY;
});

describe("listEulenDeposits", () => {
  it("parseia o array compacto {qrId,status,bankTxId}", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          { qrId: "qr-a", status: "DEPIX_SENT", bankTxId: "71" },
          { qrId: "qr-b", status: "refunded", bankTxId: null },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const res = await listEulenDeposits("2026-06-25", "2026-06-28", "depix_sent");
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(2);
    // Status normalizado p/ lowercase.
    expect(res.rows[0]).toMatchObject({ qrId: "qr-a", status: "depix_sent", bankTxId: "71" });
    expect(res.rows[1]).toMatchObject({ qrId: "qr-b", status: "refunded", bankTxId: null });
  });

  it("descarta linhas sem qrId", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ status: "depix_sent" }, { qrId: "ok", status: "depix_sent" }]), {
        status: 200,
      }),
    );
    const res = await listEulenDeposits("2026-06-25", "2026-06-28");
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.qrId).toBe("ok");
  });

  it("erro HTTP -> success:false", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("boom", { status: 500 }));
    const res = await listEulenDeposits("2026-06-25", "2026-06-28");
    expect(res.success).toBe(false);
    expect(res.rows).toEqual([]);
    expect(res.error).toContain("500");
  });

  it("resposta nao-array (envelope de erro) -> success:false", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ response: { errorMessage: "rate limited" } }), { status: 200 }),
    );
    const res = await listEulenDeposits("2026-06-25", "2026-06-28");
    expect(res.success).toBe(false);
    expect(res.error).toContain("rate limited");
  });

  it("sem DEPIX_API_KEY -> vazio sem erro (dev)", async () => {
    delete process.env.DEPIX_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await listEulenDeposits("2026-06-25", "2026-06-28");
    expect(res).toMatchObject({ success: true, rows: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
