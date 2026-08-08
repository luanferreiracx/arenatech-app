/**
 * INT-1 e INT-2 (Etapa 9, Módulo 11 — Interesses): a lista de leads escondia o
 * status e enterrava a tabela sob 900px de cartões.
 *
 * ## INT-1 — `Status` nascia a 475px
 *
 * A tabela mede **751px** numa área visível de **222** a 320px. A ordem era
 * `Nome | Telefone | Tipo | Modelo | Status | Data | Ações`, e **cinco das oito
 * colunas** nasciam fora de vista:
 *
 * | coluna | começava em | visível? |
 * |---|---|---|
 * | Nome | 73px | sim |
 * | Telefone | 187px | sim |
 * | Tipo | 291px | **não** |
 * | Modelo | 373px | **não** |
 * | **Status** | **475px** | **não** |
 * | Data | 572px | **não** |
 * | Ações | 708px | **não** |
 *
 * Num módulo de leads, "em espera / contatado / finalizado" é o que organiza o
 * trabalho: sem ele a lista não diz o que fazer com cada nome. Depois da
 * correção, `Status` começa em **187px**.
 *
 * **Terceira ocorrência da mesma classe nesta etapa** — CMU-9 (M8, coluna do
 * valor a 356px) e CMN-1 (M10, coluna de status a 707px). O padrão: a coluna que
 * decide a ação é declarada por último e nasce fora da tela.
 *
 * ## INT-2 — seis cartões empilhados antes da lista
 *
 * `grid gap-4 md:grid-cols-6` não tem passo intermediário: abaixo de 768px vira
 * **uma coluna**. Seis cartões de estatística empilhados consumiam ~900px de
 * rolagem antes de a tabela aparecer — o operador percorria a tela inteira de
 * números para chegar ao trabalho.
 *
 * ## Um erro que a medição pegou
 *
 * Ao ver "Em espera" quebrando em duas linhas, quase apliquei `whitespace-nowrap`
 * só nele. A medição mostrou que **cinco dos seis rótulos já eram cortados**
 * ("Cancelados" perdia 11px, "Contatados" 9px) — o `pt-4` do `CardContent` traz
 * `px-6`, e num cartão de ~145px sobram ~97px para o texto.
 *
 * `whitespace-nowrap` teria mascarado 1 caso de 6. A correção real foi reduzir o
 * padding lateral no celular (`px-3 sm:px-6`): **zero cortes nos seis**.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAGINA = readFileSync(
  join(process.cwd(), "src/app/(app)/interests/page.tsx"),
  "utf8",
);

/** Cabeçalhos da tabela, na ordem declarada (ignora o da checkbox). */
function ordemDasColunas(): string[] {
  return [...PAGINA.matchAll(/<TableHead[^>]*>([^<]+)<\/TableHead>/g)]
    .map((m) => (m[1] ?? "").trim())
    .filter(Boolean);
}

describe("INT-1 — o status do lead cabe na tela", () => {
  const ordem = ordemDasColunas();

  it("declara as sete colunas de conteúdo", () => {
    expect(ordem).toEqual([
      "Nome",
      "Status",
      "Telefone",
      "Tipo",
      "Modelo",
      "Data",
      "Ações",
    ]);
  });

  it("Status vem logo após Nome", () => {
    expect(
      ordem.indexOf("Status"),
      `ordem atual: ${ordem.join(" | ")}. A tabela mede 751px numa área de 222 a ` +
        `320px — o que não está nas duas primeiras posições nasce fora de vista. ` +
        `Numa lista de leads, o status é o que diz o que fazer com cada nome.`,
    ).toBe(1);
  });

  it("Status vem antes de Tipo, Modelo e Data", () => {
    const pos = (n: string) => ordem.indexOf(n);
    for (const depois of ["Tipo", "Modelo", "Data"]) {
      expect(pos("Status"), `Status deveria vir antes de ${depois}`).toBeLessThan(
        pos(depois),
      );
    }
  });

  it("o corpo da linha segue a MESMA ordem do cabeçalho", () => {
    // Reordenar só o `<thead>` desalinharia todas as células — o erro clássico
    // de mexer em tabela. O status tem que ser a 2ª célula também.
    const corpo = PAGINA.slice(PAGINA.indexOf("<TableBody>"));
    const posStatus = corpo.indexOf("INTEREST_STATUS_LABELS");
    const posTelefone = corpo.indexOf("interest.phone");
    const posTipo = corpo.indexOf("INTEREST_TYPE_LABELS");
    expect(posStatus).toBeGreaterThan(0);
    expect(posStatus).toBeLessThan(posTelefone);
    expect(posStatus).toBeLessThan(posTipo);
  });
});

describe("INT-2 — os cartões não enterram a lista", () => {
  it("o grid de estatísticas começa em duas colunas, não uma", () => {
    const i = PAGINA.indexOf("stats.total");
    const grid = PAGINA.lastIndexOf('<div className="grid', i);
    const trecho = PAGINA.slice(grid, grid + 130);
    expect(
      trecho,
      "`md:grid-cols-6` sem passo intermediário empilha os SEIS cartões numa " +
        "coluna abaixo de 768px: ~900px de rolagem antes de a lista aparecer.",
    ).toMatch(/grid-cols-2/);
    expect(trecho).toMatch(/sm:grid-cols-3/);
    expect(trecho).toMatch(/\[&>\*\]:min-w-0/);
  });

  it("os cartões têm padding lateral reduzido no celular", () => {
    // `CardContent` traz `px-6` (24px de cada lado). Num cartão de ~145px sobram
    // ~97px, e CINCO dos seis rótulos eram cortados. Medido depois: zero cortes.
    const cartoes = PAGINA.match(/<CardContent className="pt-4[^"]*"/g) ?? [];
    expect(cartoes.length).toBe(6);
    for (const c of cartoes) {
      expect(c, `cartão sem padding reduzido: ${c}`).toMatch(/px-3 sm:px-6/);
    }
  });

  it("nenhum rótulo usa whitespace-nowrap como remendo", () => {
    // Travar a quebra de UM rótulo mascara o corte dos outros cinco. A causa é
    // o padding, não a quebra de linha.
    const bloco = PAGINA.slice(
      PAGINA.indexOf("stats.total") - 400,
      PAGINA.indexOf("Conversão") + 200,
    );
    expect(bloco).not.toMatch(/whitespace-nowrap/);
  });
});
