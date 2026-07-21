import { describe, it, expect } from "vitest";
import { formatCustomerDocument } from "@/lib/utils";

describe("formatCustomerDocument", () => {
  it("mostra CPF mascarado para pessoa fisica", () => {
    expect(formatCustomerDocument({ type: "PF", cpf: "11144477735", cnpj: null })).toEqual({
      label: "CPF",
      value: "111.444.777-35",
    });
  });

  it("mostra CNPJ mascarado para pessoa juridica (regressao: PJ nao saia no recibo)", () => {
    expect(formatCustomerDocument({ type: "PJ", cpf: null, cnpj: "11222333000181" })).toEqual({
      label: "CNPJ",
      value: "11.222.333/0001-81",
    });
  });

  it("prefere CNPJ quando o tipo e PJ mesmo com CPF preenchido (dado legado)", () => {
    expect(
      formatCustomerDocument({ type: "PJ", cpf: "11144477735", cnpj: "11222333000181" }),
    ).toEqual({ label: "CNPJ", value: "11.222.333/0001-81" });
  });

  it("cai pro documento preenchido quando o tipo diverge do dado", () => {
    expect(formatCustomerDocument({ type: "PF", cpf: null, cnpj: "11222333000181" })).toEqual({
      label: "CNPJ",
      value: "11.222.333/0001-81",
    });
  });

  it("retorna null quando nao ha documento", () => {
    expect(formatCustomerDocument({ type: "PF", cpf: null, cnpj: null })).toBeNull();
    expect(formatCustomerDocument({ cpf: "", cnpj: "" })).toBeNull();
  });
});
