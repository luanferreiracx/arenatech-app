/**
 * QSL-1 (Etapa 9, Módulo 15 — Vendas Avulsas): o desconto podia ser maior que o
 * subtotal, gerando cobrança de R$ 0,00.
 *
 * ## O defeito
 *
 * `unitPrice` já exigia `min(1)` — *"Valor deve ser maior que zero"*. A intenção
 * de não cobrar zero **existia**. O desconto furava a regra por outro caminho:
 * tela e servidor usavam `Math.max(0, subtotal - desconto)`, que **zera em
 * silêncio** em vez de recusar.
 *
 * Medido no navegador: 2 × R$ 100 com R$ 500 de desconto criou a venda
 * `QS202600001` com `total_amount = 0.00` e status `AWAITING_PAYMENT`. Só não
 * gerou o PIX porque a credencial local da Eulen é inválida — **em produção teria
 * ido à API externa cobrar R$ 0,00**.
 *
 * Produção está limpa: 21 vendas, **0 zeradas**, menor valor R$ 2,00. O defeito
 * é real e nunca ocorreu.
 *
 * ## O buraco da edição parcial
 *
 * O `superRefine` do schema só enxerga o payload, e no `update` todo campo é
 * opcional: editar apenas o `discount` chegaria com `quantity`/`unitPrice`
 * indefinidos e passaria batido. **Mesma armadilha do CAT-1 (M12)** — e desta vez
 * eu já sabia procurá-la.
 *
 * A mutation já resolvia os valores efetivos (`input.x ?? existing.x`) para
 * calcular o total; a guarda entrou logo antes disso. Verificado pela API:
 *
 * | payload | resultado |
 * |---|---|
 * | `{ discount: 50000 }` (subtotal 200) | **400 barrado** |
 * | `{ discount: 5000 }` | 200 passa |
 * | `{ unitPrice: 20 }` (deixaria desconto > subtotal) | **400 barrado** |
 *
 * O último é o caso **simétrico**: baixar o preço unitário em vez de subir o
 * desconto.
 *
 * ## Por que `>=` e não `>`
 *
 * Desconto igual ao subtotal também zera a cobrança. Uma venda de R$ 0,00 não é
 * "grátis" — é um PIX que a Eulen não tem como cobrar.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createQuickSaleSchema } from "@/lib/validators/quick-sale";

const ROUTER = readFileSync(
  join(process.cwd(), "src/server/api/routers/quick-sale.ts"),
  "utf8",
);
const LISTA = readFileSync(
  join(process.cwd(), "src/app/(app)/quick-sales/page.tsx"),
  "utf8",
);

const base = {
  productDescription: "servico de teste",
  quantity: 2,
  unitPrice: 100, // centavos
};

describe("QSL-1 — o desconto não pode zerar a cobrança", () => {
  it("recusa desconto maior que o subtotal", () => {
    const r = createQuickSaleSchema.safeParse({ ...base, discount: 500 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toMatch(/ficaria zerada/);
      expect(r.error.issues[0]?.path).toEqual(["discount"]);
    }
  });

  it("recusa desconto IGUAL ao subtotal", () => {
    // 2 × 100 = 200. Desconto de 200 zera igual — uma venda de R$ 0,00 não é
    // "grátis", é um PIX que a Eulen não tem como cobrar.
    expect(createQuickSaleSchema.safeParse({ ...base, discount: 200 }).success).toBe(false);
  });

  it("aceita desconto parcial", () => {
    expect(createQuickSaleSchema.safeParse({ ...base, discount: 50 }).success).toBe(true);
  });

  it("aceita venda sem desconto", () => {
    // O campo é opcional — a guarda não pode bloquear o caso comum.
    expect(createQuickSaleSchema.safeParse(base).success).toBe(true);
    expect(createQuickSaleSchema.safeParse({ ...base, discount: 0 }).success).toBe(true);
  });

  it("mantém a regra que já existia para o preço unitário", () => {
    // `min(1)` em `unitPrice` era a intenção original de não cobrar zero. O
    // desconto furava a mesma regra por outro caminho.
    expect(createQuickSaleSchema.safeParse({ ...base, unitPrice: 0 }).success).toBe(false);
  });
});

describe("QSL-1 — a edição parcial não escapa", () => {
  it("a mutation compara os valores EFETIVOS, não o payload", () => {
    // Sem isto, `{ discount: 50000 }` sozinho passa: `quantity` e `unitPrice`
    // chegam `undefined` e o refine do schema não dispara.
    const bloco = ROUTER.slice(ROUTER.indexOf("update:"), ROUTER.indexOf("generatePix"));
    expect(bloco).toMatch(/const qty = \(input\.quantity \?\? existing\.quantity\)/);
    expect(bloco).toMatch(/input\.unitPrice \?\? decimalToCents\(existing\.unitPrice\)/);
    expect(bloco).toMatch(/input\.discount \?\? decimalToCents\(existing\.discount\)/);
    expect(bloco).toMatch(/discountCents >= qty \* unitPriceCents/);
  });

  it("a guarda vem ANTES do cálculo do total", () => {
    // Depois do `Math.max(0, ...)` seria tarde: o total já teria sido zerado.
    const bloco = ROUTER.slice(ROUTER.indexOf("update:"), ROUTER.indexOf("generatePix"));
    const posGuarda = bloco.indexOf("discountCents >= qty * unitPriceCents");
    const posTotal = bloco.indexOf("const total = Math.max(0");
    expect(posGuarda).toBeGreaterThan(0);
    expect(posGuarda).toBeLessThan(posTotal);
  });
});

/**
 * QSL-2 — a lista escondia o valor e o status.
 *
 * A tabela mede **741px** numa área de **270** a 320px, e quatro das sete
 * colunas nasciam fora de vista:
 *
 * | coluna | começava em |
 * |---|---|
 * | Numero | 25px |
 * | Data | 142px |
 * | Pagador | 241px |
 * | CPF/CNPJ | 312px (fora) |
 * | **Valor** | **420px (fora)** |
 * | **Status** | **540px (fora)** |
 * | Acoes | 709px (fora) |
 *
 * Num módulo de cobrança, "quanto" e "pago ou não" são exatamente o que a lista
 * existe para mostrar. Depois: `Valor` em 142px, `Status` em 261px.
 *
 * **Quarta ocorrência da mesma classe nesta etapa** — CMU-9 (M8, valor a 356px),
 * CMN-1 (M10, status a 707px), INT-1 (M11, status a 475px). O padrão é estável:
 * a coluna que decide a ação é declarada por último e nasce fora da tela.
 */
describe("QSL-2 — a lista mostra primeiro o que importa", () => {
  const ordem = [...LISTA.matchAll(/<TableHead[^>]*>([^<]+)<\/TableHead>/g)].map((m) =>
    (m[1] ?? "").trim(),
  );

  it("declara as sete colunas", () => {
    expect(ordem).toEqual([
      "Numero",
      "Valor",
      "Status",
      "Data",
      "Pagador",
      "CPF/CNPJ",
      "Acoes",
    ]);
  });

  it("Valor e Status vêm logo após o número", () => {
    expect(
      ordem.indexOf("Valor"),
      `ordem atual: ${ordem.join("|")}. A tabela mede 741px numa área de 270 — ` +
        `o que não está nas três primeiras posições nasce fora de vista.`,
    ).toBe(1);
    expect(ordem.indexOf("Status")).toBe(2);
  });

  it("o corpo segue a MESMA ordem do cabeçalho", () => {
    // Reordenar só o `<thead>` desalinharia todas as células — o erro clássico
    // de mexer em tabela.
    const corpo = LISTA.slice(LISTA.indexOf("<TableBody>"));
    const posValor = corpo.indexOf("formatCurrency(sale.totalAmount");
    const posStatus = corpo.indexOf("QUICK_SALE_STATUS_LABELS");
    const posData = corpo.indexOf("toLocaleDateString");
    const posPagador = corpo.indexOf("sale.buyerName");
    expect(posValor).toBeGreaterThan(0);
    expect(posValor).toBeLessThan(posStatus);
    expect(posStatus).toBeLessThan(posData);
    expect(posData).toBeLessThan(posPagador);
  });

  it("o valor não quebra linha", () => {
    // "R$ 295.000,00" quebrado no meio fica ilegível numa coluna estreita.
    const i = LISTA.indexOf("formatCurrency(sale.totalAmount");
    expect(LISTA.slice(Math.max(0, i - 200), i)).toMatch(/whitespace-nowrap/);
  });
});
