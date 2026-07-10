/**
 * evaluateEsploraHealth: decide se a saúde da Esplora do LWK merece alerta.
 * As Esploras públicas já morreram 2x e só descobríamos pelo alerta da Eulen —
 * este monitor alerta antes. Ver [[eulen-webhook-lwk-timeout]].
 */
import { describe, it, expect } from "vitest";
import {
  evaluateEsploraHealth,
  ESPLORA_ALERT_CONSECUTIVE_FAILURES,
  ESPLORA_ALERT_MAX_STALE_MS,
} from "@/lib/services/esplora-health-alert";
import type { EsploraHealthResult } from "@/lib/services/lwk-service";

const NOW = 1_800_000_000_000; // instante fixo (determinístico)

function health(over: Partial<EsploraHealthResult["health"]> = {}): EsploraHealthResult {
  return {
    reachable: true,
    health: {
      lastSyncOkAt: new Date(NOW).toISOString(),
      lastWorkingUrl: "https://waterfalls.liquidwebwallet.org/liquid/api",
      consecutiveFailures: 0,
      ...over,
    },
  };
}

describe("evaluateEsploraHealth", () => {
  it("saudável (sync recente, 0 falhas) -> não alerta", () => {
    expect(evaluateEsploraHealth(health(), NOW)).toBeNull();
  });

  it("N falhas consecutivas -> ALERTA (consecutive_failures)", () => {
    const alert = evaluateEsploraHealth(
      health({ consecutiveFailures: ESPLORA_ALERT_CONSECUTIVE_FAILURES }),
      NOW,
    );
    expect(alert?.reason).toBe("consecutive_failures");
    expect(alert?.detail.consecutiveFailures).toBe(ESPLORA_ALERT_CONSECUTIVE_FAILURES);
  });

  it("1 falha isolada (abaixo do limite) -> não alerta (oscilação normal)", () => {
    expect(evaluateEsploraHealth(health({ consecutiveFailures: 1 }), NOW)).toBeNull();
  });

  it("último sync-ok velho demais -> ALERTA (stale_sync)", () => {
    const staleAt = new Date(NOW - ESPLORA_ALERT_MAX_STALE_MS - 60_000).toISOString();
    const alert = evaluateEsploraHealth(health({ lastSyncOkAt: staleAt }), NOW);
    expect(alert?.reason).toBe("stale_sync");
    expect(alert?.detail.lastSyncOkAt).toBe(staleAt);
  });

  it("sync-ok recente dentro da janela -> não alerta", () => {
    const recentAt = new Date(NOW - (ESPLORA_ALERT_MAX_STALE_MS - 30_000)).toISOString();
    expect(evaluateEsploraHealth(health({ lastSyncOkAt: recentAt }), NOW)).toBeNull();
  });

  it("LWK INACESSÍVEL -> NÃO alerta (é problema de LWK, não de Esplora)", () => {
    const unreachable: EsploraHealthResult = { reachable: false, error: "ECONNREFUSED" };
    expect(evaluateEsploraHealth(unreachable, NOW)).toBeNull();
  });

  it("boot recente (nunca sincronizou, 0 falhas) -> não alerta", () => {
    expect(
      evaluateEsploraHealth(health({ lastSyncOkAt: null, consecutiveFailures: 0 }), NOW),
    ).toBeNull();
  });

  it("degradado agora (503) mas ainda sem N falhas nem stale -> não alerta ainda", () => {
    // Uma leitura 503 pontual não basta; o alerta espera o padrão se firmar.
    const degradedOnce: EsploraHealthResult = {
      reachable: true,
      degraded: true,
      health: { lastSyncOkAt: new Date(NOW).toISOString(), lastWorkingUrl: null, consecutiveFailures: 1 },
    };
    expect(evaluateEsploraHealth(degradedOnce, NOW)).toBeNull();
  });
});
