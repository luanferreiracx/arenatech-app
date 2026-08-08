/**
 * CAT-2, CAT-3 e CAT-4 (Etapa 9, M12) — três decisões do dono sobre o catálogo,
 * tomadas em 2026-08-08 depois da auditoria do módulo.
 *
 * ## CAT-3 — um preço só
 *
 * O catálogo tinha "preço cartão" e "preço PIX", e a auditoria tinha acabado de
 * fechar a validação que impedia o PIX de ser maior (CAT-1, PR #885). O dono
 * cortou a raiz: *"acho desnecessário. preço pix é suficiente."*
 *
 * Com um campo só, a comparação deixa de existir — e a regra saiu junto. **Guarda
 * sem dois lados para comparar é código morto que aparenta proteção**, e o teste
 * que a guardava foi removido no mesmo commit.
 *
 * **Migração antes da mudança:** 15 dos 23 aparelhos tinham preço só em `price`.
 * Removê-lo da tela os deixaria com o valor preso no banco — visível para o bot
 * (que lê `promotionalPrice ?? price`), ineditável pelo operador. Os 15 foram
 * migrados para `promotionalPrice`: **0 divergências, nenhum valor anunciado
 * mudou**.
 *
 * A coluna `price` continua na tabela e é **espelhada** a cada escrita, porque
 * ainda é lida pelo fallback do bot e pela ordenação (`orderBy: [{ price }]`).
 *
 * ## CAT-2 — condição vira lista fechada
 *
 * Era `Input` de texto livre, e produção mostrou o resultado: **"novo" (18) e
 * "Novo" (2) como valores distintos**, mais 2 "Seminovo" e 1 vazio. Mesma
 * condição escrita de dois jeitos, sem agrupar em filtro nenhum.
 *
 * Verificado na API depois da mudança:
 *
 * ```
 * "novo"     -> 200, gravou "Novo"      (legado se corrige ao editar)
 * "SEMINOVO" -> 200, gravou "Seminovo"
 * "Quebrado" -> 400, RECUSADO
 * ```
 *
 * Os 18 registros de produção foram normalizados: "novo"/"Novo" viraram um só
 * valor (20).
 *
 * ## CAT-4 — a vitrine não expõe mais o estoque exato
 *
 * *"melhor remover a quantidade e deixar apenas um alerta de últimas unidades
 * (quando tiver 2 unidades ou menos)"*.
 *
 * A quantidade exata aparecia em **três** lugares — `"100 un."` na página de
 * produto, `"Restam N"` no card e num badge da própria página. Corrigir só o que
 * eu tinha visto na tela repetiria o padrão que esta auditoria vem nomeando.
 *
 * O limiar era **3** no serviço; passou a **2**, e vive num lugar só
 * (`LOW_STOCK_THRESHOLD`), chegando ao cliente já resolvido em `lowStock`. Antes
 * cada tela formatava o próprio texto a partir de `availableQuantity` — foi
 * assim que o número acabou exposto em três lugares diferentes.
 *
 * Verificado no HTML servido (estoque 2 vs estoque 100):
 *
 * ```
 * estoque 2   -> "Últimas unidades"
 * estoque 100 -> "Em estoque"
 * "Restam N" no HTML      -> 0 ocorrências
 * availableQuantity no HTML -> 0 ocorrências
 * ```
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deviceConditionSchema, DEVICE_CONDITIONS } from "@/lib/validators/catalog";

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const ROUTER = ler("src/server/api/routers/catalog.ts");
const ADMIN = ler("src/app/(app)/aparelhos-catalogo/_components/device-catalog-admin.tsx");
const SERVICO = ler("src/server/services/public-catalog.ts");
const CARD = ler("src/app/(public)/catalog/_components/catalog-product-card.tsx");
const PRODUTO = ler("src/app/(public)/catalog/[id]/page.tsx");

describe("CAT-3 — o catálogo de aparelhos tem um preço só", () => {
  it("a tela não oferece mais 'preço cartão'", () => {
    expect(ADMIN).not.toMatch(/preco-cartao-r/);
    expect(ADMIN).not.toMatch(/Preço cartão/);
  });

  it("os schemas não aceitam mais `price`", () => {
    const bloco = ROUTER.slice(
      ROUTER.indexOf("createCatalogDevice:"),
      ROUTER.indexOf("deleteCatalogDevice:"),
    );
    expect(
      bloco,
      "aceitar `price` no input reabriria os dois preços pela API, com a tela " +
        "mostrando um só — a divergência voltaria por fora.",
    ).not.toMatch(/^\s+price: z\.number\(\)/m);
  });

  it("a escrita espelha o preço na coluna legada", () => {
    // `price` ainda é lida pelo fallback do bot (`promotionalPrice ?? price`) e
    // pela ordenação (`orderBy: [{ price: "asc" }]`). Deixá-la parada faria a
    // lista do Talison ordenar por preço antigo.
    expect(ROUTER).toMatch(/price: input\.promotionalPrice \?\? null/);
    expect(ROUTER).toMatch(/updateData\.price = data\.promotionalPrice/);
  });

  it("a validação PIX-vs-cartão foi removida, não esquecida", () => {
    // Com um preço só não há o que comparar. Manter a função seria guarda que
    // nunca dispara — pior que não ter, porque aparenta proteção.
    expect(ROUTER).not.toMatch(/precoPixNaoPodeSerMaior/);
    expect(ADMIN).not.toMatch(/não pode ser maior que o preço do cartão/);
  });

  it("a listagem não mostra 'de/por' com o mesmo número dos dois lados", () => {
    // `price` é espelho de `promotionalPrice`: o "de/por" riscaria o MESMO valor.
    expect(ADMIN).not.toMatch(/line-through/);
  });

  it("o texto de ajuda não fala mais em desconto", () => {
    // "Deixe em branco se não houver desconto" era sobra do tempo em que havia
    // preço de cartão para descontar — descrevia uma escolha que não existe.
    expect(ADMIN).not.toMatch(/se não houver desconto/);
  });

  it("a linha de switches quebra a 320px", () => {
    // `flex gap-6` sem quebra cortava "Disponível para venda" no meio. Mesma
    // classe do CMU-8 (M8): linha de controles sem estratégia de quebra.
    //
    // Afirma a AUSÊNCIA do padrão defeituoso: `flex gap-6` sem `flex-wrap`
    // seguido dos dois switches. Buscar o container por índice era frágil —
    // a primeira versão deste teste falhou contra o código já corrigido.
    // Ancora no `<Label>`, não no texto solto: a primeira ocorrência de
    // "Disponível para venda" é o COMENTÁRIO que explica a correção, e a janela
    // a partir dele cai antes do container. Foi assim que a primeira versão
    // deste teste falhou contra o código já corrigido.
    expect(ADMIN).not.toMatch(/className="flex gap-6 pt-1"/);
    const i = ADMIN.indexOf('<Label className="cursor-pointer">Disponível para venda');
    expect(i, "rótulo não encontrado").toBeGreaterThan(0);
    expect(ADMIN.slice(Math.max(0, i - 600), i)).toMatch(/flex flex-wrap gap-x-6/);
  });
});

describe("CAT-2 — condição é lista fechada", () => {
  it("a tela usa Select, não Input livre", () => {
    const i = ADMIN.indexOf('htmlFor="condicao"');
    expect(i).toBeGreaterThan(0);
    const trecho = ADMIN.slice(i, i + 700);
    expect(
      trecho,
      "texto livre gerou 'novo' e 'Novo' como valores DISTINTOS em produção " +
        "(18 e 2) — mesma condição, sem agrupar em filtro nenhum.",
    ).toMatch(/<Select/);
    expect(trecho).not.toMatch(/<Input id="condicao"/);
  });

  it("as opções vêm da constante compartilhada", () => {
    // Lista duplicada na tela divergiria do schema no primeiro valor novo.
    expect(ADMIN).toMatch(/DEVICE_CONDITIONS\.map/);
    expect(ADMIN).toMatch(/from "@\/lib\/validators\/catalog"/);
  });

  it("o servidor valida a condição", () => {
    const bloco = ROUTER.slice(
      ROUTER.indexOf("createCatalogDevice:"),
      ROUTER.indexOf("deleteCatalogDevice:"),
    );
    const usos = bloco.match(/condition: deviceConditionSchema/g) ?? [];
    expect(usos.length, "criação E edição — o irmão não fica de fora").toBe(2);
  });

  it("normaliza a caixa do legado em vez de recusá-lo", () => {
    // Os 20 registros com "novo" minúsculo se corrigem ao serem editados.
    expect(deviceConditionSchema.parse("novo")).toBe("Novo");
    expect(deviceConditionSchema.parse("SEMINOVO")).toBe("Seminovo");
    expect(deviceConditionSchema.parse("  usado  ")).toBe("Usado");
  });

  it("recusa valor fora da lista", () => {
    expect(() => deviceConditionSchema.parse("Quebrado")).toThrow();
  });

  it("aceita vazio — condição é opcional", () => {
    expect(deviceConditionSchema.parse("")).toBeNull();
    expect(deviceConditionSchema.parse(undefined)).toBeUndefined();
  });

  it("a lista cobre os valores que produção já usa", () => {
    for (const usado of ["Novo", "Seminovo"]) {
      expect(DEVICE_CONDITIONS).toContain(usado);
    }
  });
});

describe("CAT-4 — a vitrine não expõe o estoque exato", () => {
  it("nenhuma tela pública mostra a quantidade", () => {
    for (const [nome, fonte] of [["card", CARD], ["produto", PRODUTO]] as const) {
      expect(fonte, `${nome} ainda formata a quantidade`).not.toMatch(
        /availableQuantity/,
      );
      expect(fonte, `${nome} ainda mostra "Restam N"`).not.toMatch(/Restam \$\{/);
    }
  });

  it("o limiar é 2 e vive num lugar só", () => {
    expect(SERVICO).toMatch(/const LOW_STOCK_THRESHOLD = 2/);
    // As telas consomem `lowStock` já resolvido — se recalculassem o limiar,
    // card e página poderiam divergir.
    expect(CARD).toMatch(/product\.lowStock/);
    expect(PRODUTO).toMatch(/product\.lowStock/);
  });

  it("o texto de escassez não carrega número", () => {
    expect(CARD).toMatch(/Últimas unidades/);
    expect(PRODUTO).toMatch(/Últimas unidades/);
  });

  it("acima do limiar informa disponibilidade sem quantificar", () => {
    expect(PRODUTO).toMatch(/"Em estoque"/);
  });
});
