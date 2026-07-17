/**
 * isSessionRefreshStale: o TETO do fail-open do refresh do JWT (decisão 2 da
 * auditoria 2026-07-14). O refresh roda em toda navegação; se o banco falha, a
 * sessão é mantida (não derruba a navegação) — MAS só até um teto de graça. Além
 * dele, invalida (força re-login), limitando a janela em que um usuário revogado
 * retém acesso durante erro de banco, sem deslogar todo mundo num blip transitório.
 */
import { describe, it, expect } from "vitest";
import {
  isSessionRefreshStale,
  JWT_REFRESH_STALE_GRACE_MS,
} from "@/lib/auth/session-staleness";

const NOW = 1_000_000_000_000;

describe("isSessionRefreshStale", () => {
  it("verificação recente (dentro do teto) → não stale (tolera o blip)", () => {
    expect(isSessionRefreshStale(NOW - 60_000, NOW)).toBe(false);
  });

  it("verificação antiga (além do teto) → stale (invalida)", () => {
    expect(isSessionRefreshStale(NOW - JWT_REFRESH_STALE_GRACE_MS - 1000, NOW)).toBe(true);
  });

  it("nunca verificado (undefined) → stale (invalida, fail-safe)", () => {
    expect(isSessionRefreshStale(undefined, NOW)).toBe(true);
  });

  it("exatamente no teto → ainda tolera (não-stale); 1ms além → stale", () => {
    expect(isSessionRefreshStale(NOW - JWT_REFRESH_STALE_GRACE_MS, NOW)).toBe(false);
    expect(isSessionRefreshStale(NOW - JWT_REFRESH_STALE_GRACE_MS - 1, NOW)).toBe(true);
  });

  it("respeita graceMs customizado", () => {
    expect(isSessionRefreshStale(NOW - 5_000, NOW, 10_000)).toBe(false);
    expect(isSessionRefreshStale(NOW - 15_000, NOW, 10_000)).toBe(true);
  });
});
