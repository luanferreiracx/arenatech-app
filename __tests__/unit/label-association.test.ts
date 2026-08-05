/**
 * Guardião dos rótulos de formulário (auditoria de frontend 2026-08-04).
 *
 * A auditoria encontrou 329 `<Label>` sem `htmlFor` e sem envolver o campo:
 * leitor de tela anuncia o input sem nome, e clicar no rótulo não foca nada.
 * A maior parte foi ligada; este teste impede que o número volte a crescer.
 *
 * Em 2026-08-05 o teto caiu de 59 para 2: `EntitySelector`, `SupplierSelect` e
 * `FinancialCategorySelect` passaram a encaminhar `id`; os rótulos de GRUPO
 * viraram `role="group"` + `aria-labelledby`; e os que nomeavam valor só de
 * leitura viraram `<FieldTitle>` (um `<label>` sem controle é semântica errada,
 * não só falta de `htmlFor`).
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Teto atual de `<Label>` sem associação. Medido em 2026-08-05.
 *
 * Os 2 que sobram estão em `dev/components/components-catalog.tsx` — a vitrine
 * interna de componentes. Rotulam `DatePicker`/`DateRangePicker`, que não têm
 * nenhum uso em produção (`grep '<DatePicker'` fora da vitrine: zero). Plumbing
 * de `id` neles seria trabalho especulativo.
 *
 * SE ESTE TESTE FALHOU porque você adicionou um Label: use `htmlFor` + `id` no
 * campo, ou o `<Field>` de `components/domain/forms/field.tsx`, que gera e liga
 * o id sozinho. Se o rótulo nomeia um GRUPO de controles, use `role="group"` +
 * `aria-labelledby`; se nomeia um valor só de leitura, use `<FieldTitle>`.
 * Não suba o teto.
 */
const TETO_LABELS_SEM_ASSOCIACAO = 2;

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
      // Sem os comentários: a própria documentação deste padrão cita `<Label>`
      // em prosa, e contá-la inflava o número — o teto ficava medindo texto.
      const src = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
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
