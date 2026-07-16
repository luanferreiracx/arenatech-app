/**
 * Monitor do L-BTC da central: alerta (logger.error) quando o gás da central cai
 * abaixo do piso — se seca, nada reabastece os tenants e os repasses/saques travam.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
vi.mock("@/server/db", () => ({
  withAdmin: (fn: (tx: unknown) => unknown) => fn({ tenant: { findUnique } }),
  withTenant: (_t: string, fn: (tx: unknown) => unknown) => fn({}),
}));

const getBalance = vi.fn();
vi.mock("@/lib/services/lwk-service", () => ({
  getBalance: (...a: unknown[]) => getBalance(...a),
  LBTC_ASSET_ID: "lbtc",
}));

vi.mock("@/server/api/trpc", () => ({ CENTRAL_TENANT_SLUG: "arena-tech" }));

const errorSpy = vi.fn();
const warnSpy = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { error: (...a: unknown[]) => errorSpy(...a), warn: (...a: unknown[]) => warnSpy(...a), info: vi.fn() },
}));

import { checkCentralLbtcFloor, LBTC_CENTRAL_FLOOR_SATS } from "@/server/services/depix-lbtc-refill.service";

const CENTRAL = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  for (const m of [findUnique, getBalance, errorSpy, warnSpy]) m.mockReset();
  findUnique.mockResolvedValue({ id: CENTRAL });
});

describe("checkCentralLbtcFloor", () => {
  it("acima do piso: ok, sem alerta", async () => {
    getBalance.mockResolvedValue({ success: true, lbtcSatoshis: LBTC_CENTRAL_FLOOR_SATS + 1 });
    const res = await checkCentralLbtcFloor();
    expect(res.ok).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("abaixo do piso: alerta via logger.error (→ Sentry)", async () => {
    getBalance.mockResolvedValue({ success: true, lbtcSatoshis: LBTC_CENTRAL_FLOOR_SATS - 1 });
    const res = await checkCentralLbtcFloor();
    expect(res.ok).toBe(false);
    expect(res.sats).toBe(LBTC_CENTRAL_FLOOR_SATS - 1);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(String(errorSpy.mock.calls[0]![0])).toMatch(/central abaixo do piso/i);
  });

  it("getBalance falha: não derruba o cron (warn, sem error)", async () => {
    getBalance.mockResolvedValue({ success: false, error: "LWK indisponivel" });
    const res = await checkCentralLbtcFloor();
    expect(res.ok).toBe(false);
    expect(res.sats).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});
