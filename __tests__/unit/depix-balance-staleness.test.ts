/**
 * resolveBalanceStaleness: qualifica a confiança no saldo DePix (cache do LWK) a
 * partir da saúde do sync. Trava a regra "não exiba saldo obsoleto como verdade"
 * (incidente do saldo inflado da carteira central, 2026-07). O saldo vem do cache;
 * se o sync degradou, o número pode não refletir a realidade on-chain.
 */
import { describe, it, expect } from "vitest";
import {
  resolveBalanceStaleness,
  STALE_CONSECUTIVE_FAILURES,
  STALE_LAST_SYNC_MS,
} from "@/lib/depix/balance-staleness";
import type { EsploraHealthResult } from "@/lib/services/lwk-service";

const NOW = new Date("2026-07-17T12:00:00.000Z").getTime();

function health(over: Partial<EsploraHealthResult["health"]> & { reachable?: boolean; degraded?: boolean } = {}): EsploraHealthResult {
  const { reachable = true, degraded = false, ...h } = over;
  return {
    reachable,
    degraded,
    health: {
      // `in` respeita null explícito (?? o substituiria pelo default).
      lastSyncOkAt: "lastSyncOkAt" in h ? (h.lastSyncOkAt ?? null) : new Date(NOW - 60_000).toISOString(),
      lastWorkingUrl: h.lastWorkingUrl ?? "https://esplora.example/api",
      consecutiveFailures: h.consecutiveFailures ?? 0,
    },
  };
}

describe("resolveBalanceStaleness", () => {
  it("saldo fresco: sync recente, sem falhas → não-stale", () => {
    const r = resolveBalanceStaleness(health(), NOW);
    expect(r.stale).toBe(false);
    expect(r.lastSyncOkAt).not.toBeNull();
  });

  it("health=null (não deu pra consultar) → NÃO marca stale (evita alarme falso)", () => {
    expect(resolveBalanceStaleness(null, NOW).stale).toBe(false);
  });

  it("LWK inalcançável → stale", () => {
    const r = resolveBalanceStaleness({ reachable: false, error: "timeout" }, NOW);
    expect(r.stale).toBe(true);
  });

  it("readiness 503 (Esplora inalcançável agora) → stale, mas preserva lastSyncOkAt", () => {
    const r = resolveBalanceStaleness(health({ degraded: true }), NOW);
    expect(r.stale).toBe(true);
    expect(r.lastSyncOkAt).not.toBeNull();
  });

  it(`falhas consecutivas ≥ ${STALE_CONSECUTIVE_FAILURES} → stale (reproduz o incidente da central)`, () => {
    // O incidente real tinha consecutive_failures=17.
    const r = resolveBalanceStaleness(health({ consecutiveFailures: 17 }), NOW);
    expect(r.stale).toBe(true);
  });

  it("falhas abaixo do teto → não-stale (ruído normal de Esplora pública)", () => {
    const r = resolveBalanceStaleness(
      health({ consecutiveFailures: STALE_CONSECUTIVE_FAILURES - 1 }),
      NOW,
    );
    expect(r.stale).toBe(false);
  });

  it("nunca sincronizou (lastSyncOkAt=null) → stale", () => {
    const r = resolveBalanceStaleness(health({ lastSyncOkAt: null }), NOW);
    expect(r.stale).toBe(true);
  });

  it("último sync antigo demais → stale", () => {
    const old = new Date(NOW - STALE_LAST_SYNC_MS - 60_000).toISOString();
    const r = resolveBalanceStaleness(health({ lastSyncOkAt: old }), NOW);
    expect(r.stale).toBe(true);
  });

  it("último sync na borda (dentro da janela) → não-stale", () => {
    const edge = new Date(NOW - STALE_LAST_SYNC_MS + 60_000).toISOString();
    const r = resolveBalanceStaleness(health({ lastSyncOkAt: edge }), NOW);
    expect(r.stale).toBe(false);
  });

  it("lastSyncOkAt corrompido (não-parseável) → stale (fail-safe)", () => {
    const r = resolveBalanceStaleness(health({ lastSyncOkAt: "não-é-data" }), NOW);
    expect(r.stale).toBe(true);
  });
});
