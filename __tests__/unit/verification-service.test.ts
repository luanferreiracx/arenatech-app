/**
 * Comportamento do verifyCode (serviço de verificação NO-KYC, ADR 0050):
 * cobre os 5 desfechos — not_found, expired, too_many_attempts, invalid, ok —
 * sem tocar banco (Prisma mockado).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashVerificationCode, VERIFICATION_MAX_ATTEMPTS } from "@/lib/auth/verification-code";

const findFirst = vi.fn();
const update = vi.fn();
const updateMany = vi.fn();

vi.mock("@/server/db", () => ({
  prisma: {
    verificationCode: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      update: (...a: unknown[]) => update(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
    },
  },
}));

// Serviços de envio não são exercidos por verifyCode, mas o módulo os importa.
vi.mock("@/lib/services/email-service", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/services/whatsapp-cloud-service", () => ({ sendCloudTemplate: vi.fn() }));

import { consumeCode, verifyCode } from "@/server/services/verification.service";

const CODE = "123456";

function record(over: Record<string, unknown> = {}) {
  return {
    id: "rec-1",
    target: "a@b.com",
    channel: "EMAIL",
    codeHash: hashVerificationCode(CODE),
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 0,
    consumedAt: null,
    ...over,
  };
}

beforeEach(() => {
  findFirst.mockReset();
  update.mockReset();
  updateMany.mockReset();
  update.mockResolvedValue({});
  updateMany.mockResolvedValue({ count: 1 });
});

describe("verifyCode", () => {
  it("not_found quando não há código pendente", async () => {
    findFirst.mockResolvedValue(null);
    expect(await verifyCode("a@b.com", "EMAIL", CODE)).toEqual({ ok: false, reason: "not_found" });
    expect(update).not.toHaveBeenCalled();
  });

  it("expired quando passou da validade (e consome o registro)", async () => {
    findFirst.mockResolvedValue(record({ expiresAt: new Date(Date.now() - 1000) }));
    expect(await verifyCode("a@b.com", "EMAIL", CODE)).toEqual({ ok: false, reason: "expired" });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consumedAt: expect.any(Date) }) }),
    );
  });

  it("too_many_attempts ao atingir o limite (e invalida)", async () => {
    findFirst.mockResolvedValue(record({ attempts: VERIFICATION_MAX_ATTEMPTS }));
    expect(await verifyCode("a@b.com", "EMAIL", CODE)).toEqual({ ok: false, reason: "too_many_attempts" });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consumedAt: expect.any(Date) }) }),
    );
  });

  it("invalid incrementa tentativas sem consumir", async () => {
    findFirst.mockResolvedValue(record());
    expect(await verifyCode("a@b.com", "EMAIL", "000000")).toEqual({ ok: false, reason: "invalid" });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } }),
    );
  });

  it("ok com código correto e consome o registro", async () => {
    findFirst.mockResolvedValue(record());
    expect(await verifyCode("a@b.com", "EMAIL", CODE)).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consumedAt: expect.any(Date) }) }),
    );
  });

  it("aceita código com traços/espaços (normaliza)", async () => {
    findFirst.mockResolvedValue(record());
    expect(await verifyCode("a@b.com", "EMAIL", "123-456")).toEqual({ ok: true });
  });

  it("consume:false — código correto NÃO é consumido (recovery 2 canais)", async () => {
    findFirst.mockResolvedValue(record());
    expect(await verifyCode("a@b.com", "EMAIL", CODE, { consume: false })).toEqual({ ok: true });
    // Nenhum update de consumo no caminho de sucesso quando consume=false.
    expect(update).not.toHaveBeenCalled();
  });

  it("consume:false — mismatch AINDA incrementa tentativas (anti-brute-force)", async () => {
    findFirst.mockResolvedValue(record());
    expect(await verifyCode("a@b.com", "EMAIL", "000000", { consume: false })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } }),
    );
  });
});

describe("consumeCode", () => {
  it("marca o(s) código(s) pendente(s) do alvo/canal como consumido(s)", async () => {
    await consumeCode("a@b.com", "EMAIL");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { target: "a@b.com", channel: "EMAIL", consumedAt: null },
        data: expect.objectContaining({ consumedAt: expect.any(Date) }),
      }),
    );
  });
});
