/**
 * Monitor do L-BTC da central: se ela seca, nada reabastece os tenants e os
 * repasses/saques travam. Dois degraus — `warning` avisa com fôlego para
 * reagir, `critical` (abaixo do piso) é incidente.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
vi.mock("@/server/db", () => ({
  withAdmin: (fn: (tx: unknown) => unknown) =>
    fn({ tenant: { findUnique }, tenantDepixWallet: { count: async () => 3 } }),
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

import {
  checkCentralLbtcRunway,
  LBTC_CENTRAL_FLOOR_SATS,
  LBTC_REFILL_SATS,
} from "@/server/services/depix-lbtc-refill.service";
import { LBTC_WARNING_REFILLS } from "@/lib/depix/lbtc-runway";

const CENTRAL = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  for (const m of [findUnique, getBalance, errorSpy, warnSpy]) m.mockReset();
  findUnique.mockResolvedValue({ id: CENTRAL });
});

describe("checkCentralLbtcRunway", () => {
  it("com fôlego confortável: ok, sem alerta nenhum", async () => {
    getBalance.mockResolvedValue({
      success: true,
      lbtcSatoshis: LBTC_WARNING_REFILLS * LBTC_REFILL_SATS,
    });
    const res = await checkCentralLbtcRunway();
    expect(res.ok).toBe(true);
    expect(res.level).toBe("ok");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("acima do piso mas perto dele: AVISA antes de o saque quebrar", async () => {
    // O estado real de produção em 2026-08-02: 328 sats acima do piso, dois
    // refills de fôlego e nenhum aviso. Quem descobre é o próximo cliente que
    // tenta sacar.
    getBalance.mockResolvedValue({ success: true, lbtcSatoshis: LBTC_CENTRAL_FLOOR_SATS + 1 });
    const res = await checkCentralLbtcRunway();
    expect(res.ok).toBe(true);
    expect(res.level).toBe("warning");
    expect(warnSpy).toHaveBeenCalled();
    // `warn`, não `error`: ainda dá pra operar, e alarme de incidente todo ciclo
    // vira ruído que esconde o incidente de verdade.
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("abaixo do piso: alerta via logger.error (→ Sentry)", async () => {
    getBalance.mockResolvedValue({ success: true, lbtcSatoshis: LBTC_CENTRAL_FLOOR_SATS - 1 });
    const res = await checkCentralLbtcRunway();
    expect(res.ok).toBe(false);
    expect(res.sats).toBe(LBTC_CENTRAL_FLOOR_SATS - 1);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(String(errorSpy.mock.calls[0]![0])).toMatch(/central abaixo do piso/i);
  });

  it("getBalance falha: não derruba o cron (warn, sem error)", async () => {
    getBalance.mockResolvedValue({ success: false, error: "LWK indisponivel" });
    const res = await checkCentralLbtcRunway();
    expect(res.ok).toBe(false);
    expect(res.sats).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});
