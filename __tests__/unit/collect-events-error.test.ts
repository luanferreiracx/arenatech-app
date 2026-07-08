/**
 * rethrowUnlessMissingTable (auditoria F5): a coleta de eventos da apuração não
 * pode engolir erro de query — senão a comissão sai SEM as vendas, pagando a
 * menos em silêncio. Só o caso legítimo "tabela inexistente" (P2021/P2010, schema
 * de teste parcial) é tolerado; qualquer outro erro RE-LANÇA.
 */
import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { rethrowUnlessMissingTable } from "@/lib/commission/collect-events-error";

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`erro ${code}`, {
    code,
    clientVersion: "test",
  });
}

describe("rethrowUnlessMissingTable", () => {
  it("TOLERA P2021 (tabela inexistente) — não lança", () => {
    expect(() => rethrowUnlessMissingTable(prismaError("P2021"), "vendas")).not.toThrow();
  });

  it("TOLERA P2010 (relação inexistente) — não lança", () => {
    expect(() => rethrowUnlessMissingTable(prismaError("P2010"), "vendas")).not.toThrow();
  });

  it("RE-LANÇA erro Prisma genérico (ex.: P2028 timeout de transação)", () => {
    // A regressão do F5: antes o catch vazio engolia ISTO e a comissão saía a menos.
    expect(() => rethrowUnlessMissingTable(prismaError("P2028"), "vendas")).toThrow(/P2028/);
  });

  it("RE-LANÇA erro genérico não-Prisma (ex.: conexão caiu)", () => {
    const err = new Error("ECONNRESET");
    expect(() => rethrowUnlessMissingTable(err, "ordens de servico")).toThrow(/ECONNRESET/);
  });
});
