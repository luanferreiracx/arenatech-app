/**
 * E9-1 (Etapa 9, Módulo 1 — PDV): o estado `draftRetailBlocked` escapou da
 * correção do PR #573.
 *
 * O #573 (14/07) trocou `h-[calc(100vh-80px)]` por `min-h-[calc(100dvh-80px)]`
 * nos estados centrados do PDV, pela razão descrita lá: **`100vh` desalinha no
 * Safari iOS** por causa da barra de URL, e `h-` fixo corta em vez de crescer.
 *
 * Corrigiu 4 dos 5. O quinto — a tela "Venda livre não está no seu plano" — é
 * estado centrado idêntico aos outros e ficou de fora. **Décima quinta
 * ocorrência** do padrão que este programa nomeou: a regra existia e foi
 * esquecida no irmão.
 *
 * ## Por que `100dvh` e não `100vh`
 *
 * `vh` no iOS mede a viewport **sem** a barra de URL, que aparece e some ao
 * rolar. O conteúdo fica atrás da barra ou sobra espaço. `dvh` (dynamic
 * viewport height) acompanha a mudança.
 *
 * E `min-h-` em vez de `h-`: altura fixa **corta** quando o conteúdo cresce —
 * com a tradução mais longa, com o override de text-spacing do WCAG 1.4.12, ou
 * com fonte aumentada. `min-h-` centraliza e cresce.
 *
 * ## O que este teste afirma
 *
 * A **classe**, não o caso: nenhuma tela do app usa `100vh` para altura de
 * container. A lista é derivada do código — uma lista à mão foi exatamente como
 * o quinto caso escapou.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

/** Todas as ocorrências de `100vh` nas telas do app autenticado. */
function ocorrenciasDe100vh(): string[] {
  try {
    const saida = execFileSync(
      "grep",
      // `[^d]100vh` para não casar dentro de `100dvh` — o grep ingênuo
      // acusava as próprias linhas corrigidas.
      // Escopo: as telas do app autenticado. Duas exclusões deliberadas:
      //  - `global-error.tsx` roda quando o React QUEBRA — usa `style` inline
      //    porque não pode depender do Tailwind ter carregado;
      //  - `docs/partner-api` é página estática de documentação, fora do app.
      ["-rn", "--include=*.tsx", "-E", "[^d]100vh", "src/app/(app)"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    return saida.split("\n").filter(Boolean);
  } catch {
    // grep sai com 1 quando não acha nada — que é o estado desejado
    return [];
  }
}

describe("E9-1 — altura de tela usa dvh, não vh", () => {
  it("nenhuma tela usa 100vh", () => {
    const achados = ocorrenciasDe100vh();
    expect(
      achados,
      "`100vh` desalinha no Safari iOS (a barra de URL entra e sai da conta). " +
        "Use `100dvh`. O PR #573 corrigiu 4 dos 5 casos do PDV em 14/07; o " +
        "quinto (`draftRetailBlocked`) escapou por a lista ser escrita à mão.",
    ).toEqual([]);
  });
});

describe("altura de container centrado cresce, não corta", () => {
  /**
   * `h-[...]` fixo corta o conteúdo quando ele cresce — o que acontece com
   * tradução mais longa, com fonte aumentada e com o override de text-spacing
   * do WCAG 1.4.12. `min-h-[...]` centraliza e acomoda.
   */
  it("estado centrado usa min-h, não altura fixa", () => {
    let saida = "";
    try {
      saida = execFileSync(
        "grep",
        ["-rn", "--include=*.tsx", "-E", "(^|[^-:])h-\\[calc\\(100dvh", "src/app"],
        { cwd: process.cwd(), encoding: "utf8" },
      );
    } catch {
      saida = "";
    }
    // `lg:h-[calc(100dvh-80px)]` no grid de 2 colunas é LEGÍTIMO: prende a
    // altura só no desktop para as colunas rolarem por dentro. O risco é
    // altura fixa em estado CENTRADO, que corta o conteúdo ao crescer.
    const alturaFixa = saida
      .split("\n")
      .filter(Boolean)
      .filter((l) => !/\b(lg|md|xl|2xl):h-\[calc\(100dvh/.test(l));
    expect(
      alturaFixa,
      "`h-[calc(100dvh-...)]` fixa a altura e corta o conteúdo que cresce. " +
        "Use `min-h-[calc(100dvh-...)]`.",
    ).toEqual([]);
  });
});
