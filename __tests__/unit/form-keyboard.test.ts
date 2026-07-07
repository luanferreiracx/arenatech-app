import { describe, it, expect } from "vitest";
import { shouldBlockEnterSubmit } from "@/lib/utils/form-keyboard";

/**
 * Regressao: no form de produto, passar o leitor de codigo de barras num campo
 * (que emite Enter no fim) disparava o submit e salvava o produto pela metade.
 * O Enter de inputs de linha unica deve ser bloqueado; textarea e submit passam.
 */
describe("shouldBlockEnterSubmit", () => {
  it("bloqueia Enter vindo de um input de texto (leitor de codigo de barras)", () => {
    expect(shouldBlockEnterSubmit({ key: "Enter", tagName: "INPUT", type: "text" })).toBe(true);
  });

  it("bloqueia Enter vindo de input numerico", () => {
    expect(shouldBlockEnterSubmit({ key: "Enter", tagName: "INPUT", type: "number" })).toBe(true);
  });

  it("nao bloqueia teclas que nao sao Enter", () => {
    expect(shouldBlockEnterSubmit({ key: "a", tagName: "INPUT", type: "text" })).toBe(false);
    expect(shouldBlockEnterSubmit({ key: "Tab", tagName: "INPUT", type: "text" })).toBe(false);
  });

  it("deixa Enter passar em textarea (quebra de linha legitima)", () => {
    expect(shouldBlockEnterSubmit({ key: "Enter", tagName: "TEXTAREA" })).toBe(false);
  });

  it("deixa Enter passar no botao de submit (acao explicita)", () => {
    expect(shouldBlockEnterSubmit({ key: "Enter", tagName: "BUTTON", type: "submit" })).toBe(false);
  });

  it("trata tagName case-insensitive", () => {
    expect(shouldBlockEnterSubmit({ key: "Enter", tagName: "textarea" })).toBe(false);
    expect(shouldBlockEnterSubmit({ key: "Enter", tagName: "button", type: "submit" })).toBe(false);
  });
});
