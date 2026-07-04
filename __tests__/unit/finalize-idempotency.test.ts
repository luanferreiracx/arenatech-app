import { describe, it, expect, vi } from "vitest"
import { TRPCError } from "@trpc/server"
import {
  buildPaymentSignature,
  claimDraftSaleForFinalize,
  isSameFinalizeRequest,
} from "@/server/services/finalize-idempotency.service"

describe("buildPaymentSignature", () => {
  it("é independente da ordem dos pagamentos", () => {
    const a = buildPaymentSignature([
      { method: "pix", amount: 3000 },
      { method: "cartao_credito", amount: 7000, installments: 3 },
    ])
    const b = buildPaymentSignature([
      { method: "cartao_credito", amount: 7000, installments: 3 },
      { method: "pix", amount: 3000 },
    ])
    expect(a).toBe(b)
  })

  it("assume 1 parcela quando installments ausente", () => {
    expect(buildPaymentSignature([{ method: "pix", amount: 100 }])).toBe(
      buildPaymentSignature([{ method: "pix", amount: 100, installments: 1 }]),
    )
  })

  it("distingue valores, formas e parcelas diferentes", () => {
    const base = buildPaymentSignature([{ method: "pix", amount: 100 }])
    expect(base).not.toBe(buildPaymentSignature([{ method: "pix", amount: 101 }]))
    expect(base).not.toBe(buildPaymentSignature([{ method: "cash", amount: 100 }]))
    expect(base).not.toBe(
      buildPaymentSignature([{ method: "pix", amount: 100, installments: 2 }]),
    )
  })

  it("inclui a forma de devolução (downgrade) na assinatura", () => {
    expect(buildPaymentSignature([], "cash")).not.toBe(
      buildPaymentSignature([], "depix"),
    )
    expect(buildPaymentSignature([], null)).toBe(buildPaymentSignature([]))
  })
})

describe("isSameFinalizeRequest", () => {
  it("trata duplo-submit do mesmo pagamento como idempotente", () => {
    const same = isSameFinalizeRequest(
      {
        paymentDetails: [{ method: "pix", amount: 5000, installments: 1 }],
        refundDueMethod: null,
      },
      { payments: [{ method: "pix", amount: 5000 }] },
    )
    expect(same).toBe(true)
  })

  it("ignora campos extras do paymentDetails (walletTransactionId etc.)", () => {
    const same = isSameFinalizeRequest(
      {
        paymentDetails: [
          {
            method: "depix",
            amount: 5000,
            installments: 1,
            walletTransactionId: "abc",
            depixTransactionId: "xyz",
          },
        ],
        refundDueMethod: null,
      },
      { payments: [{ method: "depix", amount: 5000 }] },
    )
    expect(same).toBe(true)
  })

  it("rejeita pagamento diferente contra venda já finalizada", () => {
    const same = isSameFinalizeRequest(
      {
        paymentDetails: [{ method: "pix", amount: 5000 }],
        refundDueMethod: null,
      },
      { payments: [{ method: "cash", amount: 5000 }] },
    )
    expect(same).toBe(false)
  })

  it("trata downgrade (sem pagamentos) com mesma forma como idempotente", () => {
    const same = isSameFinalizeRequest(
      { paymentDetails: [], refundDueMethod: "depix" },
      { payments: [], refundDueMethod: "depix" },
    )
    expect(same).toBe(true)
  })

  it("rejeita downgrade com forma de devolução diferente", () => {
    const same = isSameFinalizeRequest(
      { paymentDetails: [], refundDueMethod: "cash" },
      { payments: [], refundDueMethod: "depix" },
    )
    expect(same).toBe(false)
  })

  it("lida com paymentDetails malformado sem quebrar", () => {
    expect(
      isSameFinalizeRequest(
        { paymentDetails: null, refundDueMethod: null },
        { payments: [] },
      ),
    ).toBe(true)
    expect(
      isSameFinalizeRequest(
        { paymentDetails: "lixo" as unknown, refundDueMethod: null },
        { payments: [{ method: "pix", amount: 100 }] },
      ),
    ).toBe(false)
  })
})

describe("claimDraftSaleForFinalize", () => {
  function makeTx(count: number) {
    return {
      sale: {
        updateMany: vi.fn().mockResolvedValue({ count }),
      },
    }
  }

  it("marca DRAFT→COMPLETED via compare-and-set quando ainda em rascunho", async () => {
    const tx = makeTx(1)
    await expect(claimDraftSaleForFinalize(tx, "sale-1")).resolves.toBeUndefined()
    expect(tx.sale.updateMany).toHaveBeenCalledWith({
      where: { id: "sale-1", status: "DRAFT" },
      data: { status: "COMPLETED" },
    })
  })

  it("aborta com CONFLICT quando outra finalização já reivindicou a venda (count=0)", async () => {
    const tx = makeTx(0)
    await expect(claimDraftSaleForFinalize(tx, "sale-1")).rejects.toMatchObject({
      code: "CONFLICT",
    })
  })

  it("o erro de corrida é um TRPCError (não vaza como erro genérico)", async () => {
    const tx = makeTx(0)
    await expect(claimDraftSaleForFinalize(tx, "sale-1")).rejects.toBeInstanceOf(
      TRPCError,
    )
  })
})
