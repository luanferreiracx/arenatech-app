import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "./helpers/cashier.helper";

/**
 * Associação de rótulos, medida no DOM renderizado (auditoria de frontend
 * 2026-08-04/05).
 *
 * O teste unitário `label-association.test.ts` conta `<Label>` sem `htmlFor` no
 * código-fonte. Ele não pega o caso oposto, que é pior: `htmlFor` presente
 * apontando para um id que **não existe na página**. O leitor de tela anuncia o
 * campo sem nome exatamente como se não houvesse rótulo, mas o código parece
 * certo — typecheck, lint e o teste de contagem passam.
 *
 * Foi assim que apareceu o defeito do `EntitySelector`: o `<FormControl>` do
 * shadcn injeta o id via `Slot`, e enquanto o componente não declarava a prop
 * `id`, o `htmlFor` do `<FormLabel>` apontava para o vazio. Só dirigindo o
 * browser dá para ver.
 *
 * Também checa id duplicado: id repetido é HTML inválido e o browser liga o
 * rótulo no primeiro, então numa lista de itens o clique foca sempre a linha 1.
 */

/** Telas com formulário denso, onde a associação importa no dia a dia. */
const TELAS = [
  "/stock/entry",
  "/stock/purchases/new",
  "/financial/new",
  "/financial/receivables",
  "/customers/new",
];

type Achados = {
  ligados: number;
  quebrados: string[];
  duplicados: string[];
};

async function auditarRotulos(page: Page): Promise<Achados> {
  return page.evaluate(() => {
    const quebrados: string[] = [];
    let ligados = 0;

    for (const lab of Array.from(document.querySelectorAll("label[for]"))) {
      const alvo = (lab as HTMLLabelElement).htmlFor;
      if (document.getElementById(alvo)) ligados++;
      else quebrados.push(`htmlFor="${alvo}" (${lab.textContent?.trim().slice(0, 40)})`);
    }

    const ids = Array.from(document.querySelectorAll("[id]")).map((e) => e.id);
    const duplicados = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];

    return { ligados, quebrados, duplicados };
  });
}

test.describe("rótulos de formulário", () => {
  for (const rota of TELAS) {
    test(`@business ${rota}: todo htmlFor aponta para um controle real`, async ({ page }) => {
      await loginAs(page, "operator");
      await page.goto(rota);
      await page.waitForLoadState("networkidle");

      const { ligados, quebrados, duplicados } = await auditarRotulos(page);

      expect(quebrados, `rótulos apontando para id inexistente:\n${quebrados.join("\n")}`).toEqual(
        [],
      );
      expect(duplicados, `ids repetidos no DOM: ${duplicados.join(", ")}`).toEqual([]);
      // Se a tela renderizou zero rótulos, o teste não mediu nada e passaria à
      // toa — provavelmente redirecionou para o login ou quebrou antes do form.
      expect(ligados, `${rota} não renderizou nenhum rótulo associado`).toBeGreaterThan(0);
    });
  }
});
