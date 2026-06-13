/**
 * Step-up 2FA para acoes sensiveis (saque DePix). Cobre os caminhos:
 * nao-enrolled (bloqueia), TOTP valido, backup code (consome), invalido.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
const verifyTotp = vi.fn();
const consumeBackupCode = vi.fn();
const decryptSecret = vi.fn();

vi.mock("@/lib/auth/two-factor", () => ({
  decryptSecret: (...a: unknown[]) => decryptSecret(...a),
  verifyTotp: (...a: unknown[]) => verifyTotp(...a),
  consumeBackupCode: (...a: unknown[]) => consumeBackupCode(...a),
}));

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (tx: unknown) => unknown) => fn({ user: { findUnique, update } }),
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
    expect(consumeBackupCode).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("cai pra backup code quando TOTP falha e consome o code", async () => {
    findUnique.mockResolvedValue({
      twoFactorEnabled: true,
      twoFactorSecret: "enc",
      twoFactorBackupCodes: ["h1", "h2"],
    });
    verifyTotp.mockReturnValue(false);
    consumeBackupCode.mockReturnValue(["h2"]); // consumiu h1
    const r = await verifyUserTwoFactor(USER, "BACKUP-CODE");
    expect(r).toEqual({ ok: true });
    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0]![0] as { data: { twoFactorBackupCodes: string[] } };
    expect(arg.data.twoFactorBackupCodes).toEqual(["h2"]);
  });

  it("rejeita quando TOTP falha e nenhum backup code casa", async () => {
    findUnique.mockResolvedValue({
      twoFactorEnabled: true,
      twoFactorSecret: "enc",
      twoFactorBackupCodes: ["h1"],
    });
    verifyTotp.mockReturnValue(false);
    consumeBackupCode.mockReturnValue(null);
    const r = await verifyUserTwoFactor(USER, "999999");
    expect(r).toEqual({ ok: false, reason: "invalid_code" });
    expect(update).not.toHaveBeenCalled();
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
