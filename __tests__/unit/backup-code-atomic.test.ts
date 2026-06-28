/**
 * consumeBackupCodeAtomic: consumo de backup code de 2FA à prova de corrida.
 * O UPDATE condicional (array_remove + = ANY) garante uso único — só UMA de
 * duas requisições concorrentes com o mesmo código afeta a linha (count=1).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { consumeBackupCodeAtomic, markTotpCounterUsedAtomic } from "@/server/services/backup-code.service";
import { hashBackupCode } from "@/lib/auth/two-factor";

const executeRaw = vi.fn();
const tx = { $executeRaw: executeRaw } as never;

beforeEach(() => executeRaw.mockReset());

describe("consumeBackupCodeAtomic", () => {
  it("retorna true quando o UPDATE afeta 1 linha (consumiu)", async () => {
    executeRaw.mockResolvedValue(1);
    expect(await consumeBackupCodeAtomic(tx, "user-1", "ABCDE-12345")).toBe(true);
  });

  it("retorna false quando 0 linhas (código inválido ou já consumido)", async () => {
    executeRaw.mockResolvedValue(0);
    expect(await consumeBackupCodeAtomic(tx, "user-1", "ABCDE-12345")).toBe(false);
  });

  it("usa o HASH do código (não o texto cru) no UPDATE", async () => {
    executeRaw.mockResolvedValue(1);
    await consumeBackupCodeAtomic(tx, "user-1", "ABCDE-12345");
    // A query parametrizada carrega o hash, nunca o código em claro.
    const sql = JSON.stringify(executeRaw.mock.calls[0]?.[0]);
    expect(sql).toContain(hashBackupCode("ABCDE-12345"));
    expect(sql).not.toContain("ABCDE-12345");
  });

  it("normaliza (trim) o código antes de hashear", async () => {
    executeRaw.mockResolvedValue(1);
    await consumeBackupCodeAtomic(tx, "user-1", "  ABCDE-12345  ");
    const sql = JSON.stringify(executeRaw.mock.calls[0]?.[0]);
    expect(sql).toContain(hashBackupCode("ABCDE-12345"));
  });
});

describe("markTotpCounterUsedAtomic (anti-replay TOTP — P2-1)", () => {
  it("retorna true quando o UPDATE afeta 1 linha (counter novo aceito)", async () => {
    executeRaw.mockResolvedValue(1);
    expect(await markTotpCounterUsedAtomic(tx, "user-1", 1000)).toBe(true);
  });

  it("retorna false quando 0 linhas (counter <= último usado → replay)", async () => {
    executeRaw.mockResolvedValue(0);
    expect(await markTotpCounterUsedAtomic(tx, "user-1", 1000)).toBe(false);
  });

  it("só aceita counter ESTRITAMENTE maior (UPDATE condicional com <)", async () => {
    executeRaw.mockResolvedValue(1);
    await markTotpCounterUsedAtomic(tx, "user-1", 1000);
    const sql = JSON.stringify(executeRaw.mock.calls[0]?.[0]);
    expect(sql).toContain("two_factor_last_used_counter");
    expect(sql).toContain("IS NULL OR");
    expect(sql).toContain("<");
  });
});
