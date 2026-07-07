import { describe, it, expect } from "vitest"
import { isSettledForSaleDepixStatus } from "@/lib/services/depix-transaction-fee"

// Regressão: o PDV mostrava "Pagamento confirmado" e depois um X ao finalizar,
// porque o finalize exigia COMPLETED (crédito on-chain) enquanto o SSE já liberava
// a venda no marco PIX-recebido (PROCESSING). A guarda deve aceitar PROCESSING.
describe("isSettledForSaleDepixStatus", () => {
  it("aceita PROCESSING (PIX recebido — dinheiro fiat já caiu)", () => {
    expect(isSettledForSaleDepixStatus("PROCESSING")).toBe(true)
  })

  it("aceita COMPLETED e COMPLETED_FEE_PENDING (crédito on-chain concluído)", () => {
    expect(isSettledForSaleDepixStatus("COMPLETED")).toBe(true)
    expect(isSettledForSaleDepixStatus("COMPLETED_FEE_PENDING")).toBe(true)
  })

  it("rejeita PENDING (QR gerado, PIX ainda não caiu)", () => {
    expect(isSettledForSaleDepixStatus("PENDING")).toBe(false)
  })

  it("rejeita estados terminais de falha", () => {
    expect(isSettledForSaleDepixStatus("EXPIRED")).toBe(false)
    expect(isSettledForSaleDepixStatus("FAILED")).toBe(false)
    expect(isSettledForSaleDepixStatus("CANCELLED")).toBe(false)
  })
})
