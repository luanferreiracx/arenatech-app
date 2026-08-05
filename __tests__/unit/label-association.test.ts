/**
 * Guardião dos rótulos de formulário (auditoria de frontend 2026-08-04).
 *
 * A auditoria encontrou 329 `<Label>` sem `htmlFor` e sem envolver o campo:
 * leitor de tela anuncia o input sem nome, e clicar no rótulo não foca nada.
 * A maior parte foi ligada; este teste impede que o número volte a crescer.
 *
 * É um teto, não um zero: os que sobraram envolvem componentes que ainda não
 * encaminham `id` (Switch, Checkbox, EntitySelector, Controller). Baixar o teto
 * conforme forem sendo resolvidos é o caminho — subir, não.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Teto atual de `<Label>` sem associação. Medido em 2026-08-04, depois do
 * mutirão que levou de 329 para este número.
 *
 * SE ESTE TESTE FALHOU porque você adicionou um Label: use `htmlFor` + `id` no
 * campo, ou o `<Field>` de `components/domain/forms/field.tsx`, que gera e liga
 * o id sozinho. Não suba o teto.
 */
const TETO_LABELS_SEM_ASSOCIACAO = 59;

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("rótulos de formulário", () => {
  it("não cresce o número de <Label> sem associação", () => {
    const files = [
      ...tsxFiles(join(process.cwd(), "src", "app")),
      ...tsxFiles(join(process.cwd(), "src", "components")),
    ];

    const ocorrencias: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      // `<Label>` puro: sem `htmlFor`, sem `id`, sem nada. O `<Label ...>` com
      // props (inclusive `htmlFor`) não casa aqui de propósito.
      const matches = src.match(/<Label>/g);
      if (matches) {
        ocorrencias.push(`${file.replace(process.cwd() + "/", "")}: ${matches.length}`);
      }
    }
    const total = ocorrencias.reduce((sum, l) => sum + Number(l.split(": ")[1]), 0);

    expect(
      total,
      `<Label> sem associação subiu para ${total} (teto ${TETO_LABELS_SEM_ASSOCIACAO}).\n` +
        `Use htmlFor+id, ou o <Field> de components/domain/forms/field.tsx.\n` +
        ocorrencias.join("\n"),
    ).toBeLessThanOrEqual(TETO_LABELS_SEM_ASSOCIACAO);
  });
});
