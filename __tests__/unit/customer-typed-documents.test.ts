import { describe, it, expect } from "vitest";
import { resolveTypedDocuments } from "@/lib/validators/customer";

describe("resolveTypedDocuments", () => {
  it("PF grava só CPF (normalizado), CNPJ vai null mesmo se preenchido", () => {
    // Regressao: usuario digitou CPF, trocou pra PF de volta mantendo lixo no
    // campo CNPJ. So o CPF deve ser gravado.
    const r = resolveTypedDocuments("PF", "123.456.789-09", "11.111.111/1111-11");
    expect(r).toEqual({ cpf: "12345678909", cnpj: null });
  });

  it("PJ grava só CNPJ (normalizado), CPF vai null mesmo se preenchido", () => {
    // Regressao central: PJ com CPF órfão no form nao pode gravar o CPF (senao
    // um PJ carrega CPF alheio e pode falsar o índice único de CPF).
    const r = resolveTypedDocuments("PJ", "123.456.789-09", "11.222.333/0001-81");
    expect(r).toEqual({ cpf: null, cnpj: "11222333000181" });
  });

  it("documentos ausentes viram null", () => {
    expect(resolveTypedDocuments("PF", null, undefined)).toEqual({ cpf: null, cnpj: null });
    expect(resolveTypedDocuments("PJ", "", "")).toEqual({ cpf: null, cnpj: null });
  });
});
