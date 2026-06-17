import { describe, it, expect } from "vitest"
import { selectIdsToCover } from "@/server/services/refund-coverage.service"

describe("selectIdsToCover", () => {
  it("cobre exato com 1 item", () => {
    const ids = selectIdsToCover([{ id: "a", amountCents: 500 }], 500)
    expect(ids).toEqual(["a"])
  })

  it("soma itens na ordem até cobrir", () => {
    const ids = selectIdsToCover(
      [
        { id: "a", amountCents: 300 },
        { id: "b", amountCents: 300 },
        { id: "c", amountCents: 400 },
      ],
      500,
    )
    // 300 (a) ainda não cobre; +300 (b) = 600 >= 500 → para
    expect(ids).toEqual(["a", "b"])
  })

  it("cancela item INTEIRO mesmo cobrindo a mais (R3)", () => {
    const ids = selectIdsToCover(
      [
        { id: "c", amountCents: 400 },
        { id: "a", amountCents: 300 },
      ],
      500,
    )
    // 400 não cobre; +300 = 700 >= 500. Cancela os dois (parcela não fraciona).
    expect(ids).toEqual(["c", "a"])
  })

  it("valor zero a cobrir → nada", () => {
    expect(selectIdsToCover([{ id: "a", amountCents: 500 }], 0)).toEqual([])
  })

  it("ignora itens de valor <= 0 (já pagos)", () => {
    const ids = selectIdsToCover(
      [
        { id: "paid", amountCents: 0 },
        { id: "a", amountCents: 500 },
      ],
      400,
    )
    expect(ids).toEqual(["a"])
  })

  it("respeita a ordem dada (prazo mais distante primeiro)", () => {
    const ids = selectIdsToCover(
      [
        { id: "far", amountCents: 100 },
        { id: "mid", amountCents: 100 },
        { id: "near", amountCents: 100 },
      ],
      150,
    )
    expect(ids).toEqual(["far", "mid"])
  })

  it("cobre tudo quando o valor excede a soma disponível", () => {
    const ids = selectIdsToCover(
      [
        { id: "a", amountCents: 100 },
        { id: "b", amountCents: 100 },
      ],
      9999,
    )
    expect(ids).toEqual(["a", "b"])
  })
})
