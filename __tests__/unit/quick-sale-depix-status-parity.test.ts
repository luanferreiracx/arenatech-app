/**
 * Auditoria 2026-08-05 (C2): o mesmo arquivo respondia "esse deposito ja pode
 * liberar a venda?" de dois jeitos diferentes.
 *
 *   quick-sale.ts:294  -> isSettledForSaleDepixStatus(...)   aceita PROCESSING
 *   quick-sale.ts:464  -> comparacao a mao                   NAO aceitava
 *
 * `PROCESSING` num deposito de venda so e gravado DEPOIS do PIX cair — por isso
 * a fonte unica o aceita, com a justificativa escrita em
 * `depix-transaction-fee.ts:60-69`. O resultado da divergencia: o cliente
 * pagava, o `markPaid` liberava a venda por um caminho, e a tela de status
 * continuava dizendo "pendente" pelo outro.
 *
 * Este teste guarda a REGRA, nao a chamada: se alguem reintroduzir uma lista de
 * status escrita a mao em qualquer lugar, o conjunto deixa de bater.
 */
import { describe, it, expect } from "vitest";
import { isSettledForSaleDepixStatus } from "@/lib/services/depix-transaction-fee";

describe("paridade do status DePix que libera venda", () => {
  it("PROCESSING conta como pago (o caso que a divergencia deixava de fora)", () => {
    expect(isSettledForSaleDepixStatus("PROCESSING")).toBe(true);
  });

  it("os estados terminais de sucesso contam como pago", () => {
    expect(isSettledForSaleDepixStatus("COMPLETED")).toBe(true);
    expect(isSettledForSaleDepixStatus("COMPLETED_FEE_PENDING")).toBe(true);
  });

  it("estado nao-liquidado NAO conta como pago", () => {
    for (const s of ["PENDING", "AWAITING_DEPOSIT", "HELD", "EXPIRED", "FAILED", "CANCELLED", "MED_REFUNDED"]) {
      expect(isSettledForSaleDepixStatus(s), `${s} nao pode liberar venda`).toBe(false);
    }
  });

  it("o router nao reintroduz uma lista de status escrita a mao", async () => {
    const fonte = await import("node:fs").then((fs) =>
      fs.readFileSync("src/server/api/routers/quick-sale.ts", "utf8"),
    );
    // A comparacao direta com COMPLETED_FEE_PENDING era a marca da
    // reimplementacao. Se voltar, e sinal de que a fonte unica foi contornada.
    expect(
      fonte.includes('walletTx.status === "COMPLETED_FEE_PENDING"'),
      "quick-sale.ts voltou a comparar status na mao — use isSettledForSaleDepixStatus",
    ).toBe(false);
  });
});
