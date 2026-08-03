/**
 * Versão dos documentos legais (ADR 0065).
 *
 * O aceite do cadastro grava `CURRENT_TERMS_VERSION`, e as páginas em `/legal`
 * exibem `CURRENT_TERMS_LABEL`. As duas descrevem a MESMA data em formatos
 * diferentes — máquina e humano —, e é aí que mora o defeito silencioso: alguém
 * edita o texto dos Termos, atualiza a data exibida e esquece a versão. A partir
 * daí todo aceite novo é carimbado com a versão de um documento que não existe
 * mais, e ninguém percebe até precisar provar o quê foi aceito.
 */
import { describe, it, expect } from "vitest";
import { CURRENT_TERMS_VERSION, CURRENT_TERMS_LABEL } from "@/lib/legal/terms-version";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

describe("versão dos documentos legais", () => {
  it("usa formato AAAA-MM-DD (ordenável como string, sem ambiguidade de fuso)", () => {
    expect(CURRENT_TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("é uma data real", () => {
    const [ano, mes, dia] = CURRENT_TERMS_VERSION.split("-").map(Number);
    const d = new Date(Date.UTC(ano!, mes! - 1, dia!));
    expect(d.getUTCFullYear()).toBe(ano);
    expect(d.getUTCMonth() + 1).toBe(mes);
    expect(d.getUTCDate()).toBe(dia);
  });

  it("o rótulo exibido nas páginas descreve a MESMA data da versão gravada", () => {
    // É o guardião do defeito: versão e rótulo saindo de sincronia significa
    // documento novo com aceite carimbado como antigo.
    const [ano, mes, dia] = CURRENT_TERMS_VERSION.split("-").map(Number);
    const esperado = `${String(dia).padStart(2, "0")} de ${MESES[mes! - 1]} de ${ano}`;
    expect(CURRENT_TERMS_LABEL).toBe(esperado);
  });
});
