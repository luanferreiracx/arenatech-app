/**
 * E9-5 (Etapa 9, Módulo 6 — Estoque): `/stock/nfe` rolava 50px na horizontal a
 * 320px, violando WCAG 1.4.10.
 *
 * O culpado é uma armadilha específica do HTML: **`input[type="file"]` tem
 * largura intrínseca**. O Chrome a calcula pelo texto do botão ("Escolher
 * arquivo") mais o rótulo do arquivo selecionado, e **ignora o container**.
 *
 * Medido a 320px de viewport:
 *
 * ```
 * input[type=file]  w=361px  right=436  viewport=320  maxWidth=none
 * ```
 *
 * `mx-auto` centraliza, mas não limita — foi a classe que estava lá.
 *
 * ## Por que só este ponto quebrou
 *
 * O app tem **6** inputs de arquivo. Cinco estão seguros:
 *
 * | arquivo | situação |
 * |---|---|
 * | `variation-images-panel.tsx` | escondido (acionado por botão) |
 * | `photo-gallery.tsx` | escondido |
 * | `logo-upload.tsx` | escondido |
 * | `stock/import/page.tsx` | usa `<Input>` do shadcn |
 * | `service-orders/[id]/edit` | usa `<Input>` do shadcn |
 * | **`stock/nfe/page.tsx`** | **`<input>` nativo, sem limite** |
 *
 * O componente `<Input>` do shadcn já traz `w-full min-w-0` — quem o usa está
 * protegido de graça. O defeito era o **único ponto que escapou do design
 * system**, e é por isso que o teste afirma a regra sobre `<input>` nativo
 * visível, não sobre todos.
 *
 * Verificado depois do fix:
 *
 * | viewport | rola? | largura do input |
 * |---|---|---|
 * | 320px | **0** | 170px |
 * | 375px | **0** | 225px |
 * | 640px | **0** | 361px |
 * | 1280px | **0** | 361px |
 *
 * Encolhe com o container e continua clicável.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/** Todos os `<input type="file">` do app, achados no código. */
function inputsDeArquivo(): Array<{ arquivo: string; linha: number }> {
  let saida = "";
  try {
    saida = execFileSync(
      "grep",
      ["-rn", "--include=*.tsx", 'type="file"', "src/app", "src/components"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
  } catch {
    return [];
  }
  return saida
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [arquivo, linha] = l.split(":");
      return { arquivo: arquivo!, linha: Number(linha) };
    });
}

/** O input está escondido (acionado por botão) ou usa o `<Input>` do shadcn? */
function estaProtegido(arquivo: string, linha: number): boolean {
  const linhas = readFileSync(join(process.cwd(), arquivo), "utf8").split("\n");
  const janela = linhas.slice(Math.max(0, linha - 8), linha + 6).join("\n");

  // 1. escondido: o usuário clica num botão, o input nunca ocupa espaço
  if (/\bhidden\b|sr-only/.test(janela)) return true;
  // 2. componente do design system: já traz `w-full min-w-0`
  if (/<Input\b/.test(janela)) return true;
  // 3. `<input>` nativo visível: precisa limitar explicitamente
  return /max-w-full|w-full/.test(janela);
}

describe("E9-5 — input de arquivo não estoura o container", () => {
  const INPUTS = inputsDeArquivo();

  it("encontra os inputs de arquivo no código (lista não escrita à mão)", () => {
    expect(INPUTS.length).toBeGreaterThan(0);
  });

  for (const { arquivo, linha } of INPUTS) {
    const nome = arquivo.split("/").slice(-2).join("/");
    it(`${nome}:${linha} está escondido, usa <Input> ou limita a largura`, () => {
      expect(
        estaProtegido(arquivo, linha),
        `\`input[type="file"]\` visível sem \`max-w-full\`/\`w-full\`. A largura ` +
          `é INTRÍNSECA (o Chrome calcula pelo texto do botão + nome do arquivo) ` +
          `e ignora o container: medido 361px numa viewport de 320px. ` +
          `\`mx-auto\` centraliza, mas não limita.`,
      ).toBe(true);
    });
  }
});
