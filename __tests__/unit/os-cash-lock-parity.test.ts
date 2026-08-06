/**
 * Etapa 7, Módulo 1 (M1-3): a OS era o único router de dinheiro que escrevia na
 * gaveta SEM `lockOpenCashSessionOrThrow`.
 *
 * O padrão e a razão estão escritos no `sale.ts`, no fix do B9:
 *
 *   "Entre o `findFirst` acima e o `writeCashMovement` abaixo há uma janela em
 *    que o fechamento pode commitar: o movimento entraria numa sessão já
 *    fechada e ficaria FORA da conferência — dinheiro que o relatório de
 *    fechamento não conta."
 *
 * E a nota do mesmo fix nomeia a classe: "é o mesmo padrão que a auditoria
 * encontrou seis vezes: a correção fecha a instância, não a classe." A OS era a
 * sétima instância — a que ficou.
 *
 * Este teste afirma a PARIDADE entre os routers que mexem na gaveta, para que a
 * oitava não apareça em silêncio.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Routers que escrevem CashMovement e portanto precisam do lock. */
const ROUTERS_DE_GAVETA = [
  "src/server/api/routers/sale.ts",
  "src/server/api/routers/cashier.ts",
  "src/server/api/routers/financial.ts",
  "src/server/api/routers/service-order.ts",
];

function ler(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("M1-3 — todo router que escreve na gaveta trava a sessão antes", () => {
  for (const rel of ROUTERS_DE_GAVETA) {
    it(`${rel.split("/").pop()} usa lockOpenCashSessionOrThrow`, () => {
      const src = ler(rel);
      const escreve = (src.match(/writeCashMovement\(/g) ?? []).length;
      const trava = (src.match(/lockOpenCashSessionOrThrow\(/g) ?? []).length;

      if (escreve === 0) return; // router que não mexe na gaveta não precisa

      expect(
        trava,
        `${rel} tem ${escreve} escrita(s) em CashMovement e ${trava} lock(s). ` +
          `Sem o lock, o movimento pode cair numa sessão fechada entre o findFirst ` +
          `e a escrita — dinheiro fora da conferência.`,
      ).toBeGreaterThan(0);
    });
  }
});
