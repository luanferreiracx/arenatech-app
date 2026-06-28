/**
 * Step-up 2FA para acoes sensiveis (saque DePix). Cobre os caminhos:
 * nao-enrolled (bloqueia), TOTP valido, backup code (consome), invalido.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const verifyTotp = vi.fn();
const consumeBackupCodeAtomic = vi.fn();
const decryptSecret = vi.fn();

vi.mock("@/lib/auth/two-factor", () => ({
  decryptSecret: (...a: unknown[]) => decryptSecret(...a),
  verifyTotp: (...a: unknown[]) => verifyTotp(...a),
}));

vi.mock("@/server/services/backup-code.service", () => ({
  consumeBackupCodeAtomic: (...a: unknown[]) => consumeBackupCodeAtomic(...a),
}));

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (tx: unknown) => unknown) => fn({ user: { findUnique } }),
}));

import { verifyUserTwoFactor } from "@/lib/auth/two-factor-verify";

const USER = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  decryptSecret.mockReturnValue("PLAINSECRET");
});

describe("verifyUserTwoFactor", () => {
  it("bloqueia quando o usuario nao tem 2FA habilitado", async () => {
    findUnique.mockResolvedValue({ twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: [] });
    const r = await verifyUserTwoFactor(USER, "123456");
    expect(r).toEqual({ ok: false, reason: "not_enrolled" });
    expect(verifyTotp).not.toHaveBeenCalled();
  });

  it("bloqueia quando enabled mas sem segredo (estado inconsistente)", async () => {
    findUnique.mockResolvedValue({ twoFactorEnabled: true, twoFactorSecret: null, twoFactorBackupCodes: [] });
    const r = await verifyUserTwoFactor(USER, "123456");
    expect(r).toEqual({ ok: false, reason: "not_enrolled" });
  });

  it("codigo vazio com 2FA ativo = invalid_code", async () => {
    findUnique.mockResolvedValue({ twoFactorEnabled: true, twoFactorSecret: "enc", twoFactorBackupCodes: [] });
    const r = await verifyUserTwoFactor(USER, "   ");
    expect(r).toEqual({ ok: false, reason: "invalid_code" });
  });

  it("aceita TOTP valido", async () => {
    findUnique.mockResolvedValue({ twoFactorEnabled: true, twoFactorSecret: "enc", twoFactorBackupCodes: [] });
    verifyTotp.mockReturnValue(true);
    const r = await verifyUserTwoFactor(USER, "123456");
    expect(r).toEqual({ ok: true });
    expect(consumeBackupCodeAtomic).not.toHaveBeenCalled();
  });

  it("cai pra backup code quando TOTP falha e consome ATOMICAMENTE", async () => {
    findUnique.mockResolvedValue({
      twoFactorEnabled: true,
      twoFactorSecret: "enc",
      twoFactorBackupCodes: ["h1", "h2"],
    });
    verifyTotp.mockReturnValue(false);
    consumeBackupCodeAtomic.mockResolvedValue(true); // consumiu
    const r = await verifyUserTwoFactor(USER, "BACKUP-CODE");
    expect(r).toEqual({ ok: true });
    expect(consumeBackupCodeAtomic).toHaveBeenCalledWith(expect.anything(), USER, "BACKUP-CODE");
  });

  it("rejeita quando TOTP falha e o backup code nao consome (invalido/ja usado)", async () => {
    findUnique.mockResolvedValue({
      twoFactorEnabled: true,
      twoFactorSecret: "enc",
      twoFactorBackupCodes: ["h1"],
    });
    verifyTotp.mockReturnValue(false);
    consumeBackupCodeAtomic.mockResolvedValue(false);
    const r = await verifyUserTwoFactor(USER, "999999");
    expect(r).toEqual({ ok: false, reason: "invalid_code" });
  });

  it("segredo corrompido (decrypt lanca) = invalid_code, nao explode", async () => {
    findUnique.mockResolvedValue({ twoFactorEnabled: true, twoFactorSecret: "corrupt", twoFactorBackupCodes: [] });
    decryptSecret.mockImplementation(() => {
      throw new Error("bad key");
    });
    const r = await verifyUserTwoFactor(USER, "123456");
    expect(r).toEqual({ ok: false, reason: "invalid_code" });
  });
});
