/**
 * E9-3 (Etapa 9, Módulo 3 — Caixa): o diálogo de sangria **recebia**
 * `availableBalance`, **exibia** o valor na tela, e **não o usava** para
 * validar.
 *
 * O operador digitava R$ 500 com R$ 10 na gaveta, clicava, e só então descobria:
 *
 * ```
 * 400 "Saldo em dinheiro insuficiente. Disponivel: R$ 10,00"
 * ```
 *
 * O servidor sempre esteve certo — a defesa real está lá, e este teste não a
 * substitui. O que faltava era **prevenção de erro** na camada onde o operador
 * age (Nielsen #5): a informação para barrar já estava no componente.
 *
 * Provado no navegador, depois do fix, com caixa real de R$ 10,00:
 *
 * ```
 * aviso visível: "Valor acima do disponível em dinheiro (R$ 10,00)."
 * botão travado: true
 * ```
 *
 * ## Por que isto não é redundância
 *
 * Validar no cliente **e** no servidor não é duplicação — é defesa em
 * profundidade com propósitos diferentes:
 *
 * - **servidor**: garante a integridade do dinheiro, e é inegociável;
 * - **cliente**: evita que o operador chegue a tentar, num fluxo em que ele
 *   está com dinheiro físico na mão e contando.
 *
 * O risco de divergir existe, e é por isso que o teste afirma que a UI usa **a
 * mesma fonte** (`availableBalance`, vindo do `summary.expectedCashBalance` do
 * servidor) — não um cálculo próprio.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DASH = readFileSync(
  join(process.cwd(), "src/app/(app)/cashier/_components/cashier-dashboard.tsx"),
  "utf8",
);

/** Corpo do componente de diálogo (são funções locais, não procedures). */
function corpoDoDialogo(nome: string): string {
  const i = DASH.indexOf(`function ${nome}(`);
  if (i < 0) throw new Error(`diálogo ${nome} não encontrado`);
  const resto = DASH.slice(i + 10);
  const prox = resto.search(/\nfunction \w+\(/);
  return prox < 0 ? DASH.slice(i) : DASH.slice(i, i + 10 + prox);
}

describe("E9-3 — sangria não deixa pedir mais do que há na gaveta", () => {
  const corpo = corpoDoDialogo("WithdrawalDialog");

  it("o botão trava quando o valor excede o disponível", () => {
    expect(
      corpo,
      "o diálogo já recebia `availableBalance` e o exibia na tela — só não o " +
        "usava para validar. O operador descobria pelo 400 do servidor, com o " +
        "dinheiro na mão.",
    ).toMatch(/amount > availableBalance/);
  });

  it("avisa antes de clicar, com o valor disponível", () => {
    // Botão travado sem explicação é pior que erro do servidor: o operador não
    // sabe por que não consegue prosseguir.
    expect(corpo).toMatch(/role="alert"/);
    expect(corpo).toMatch(/formatCents\(availableBalance\)/);
  });

  it("usa a MESMA fonte do servidor, não um cálculo próprio", () => {
    // `availableBalance` vem de `summary.expectedCashBalance`. Um cálculo
    // paralelo no cliente divergiria em silêncio.
    const chamada = DASH.slice(DASH.indexOf("<WithdrawalDialog"), DASH.indexOf("<WithdrawalDialog") + 600);
    expect(chamada).toMatch(/availableBalance=\{summary\.expectedCashBalance\}/);
  });
});

describe("as proteções que já existiam continuam de pé", () => {
  it("sangria exige motivo", () => {
    expect(corpoDoDialogo("WithdrawalDialog")).toMatch(/!description\.trim\(\)/);
  });

  it("sangria trava durante o envio (anti duplo clique)", () => {
    expect(corpoDoDialogo("WithdrawalDialog")).toMatch(/disabled=\{\s*isPending/);
  });

  it("o dashboard não usa optimistic update no saldo", () => {
    // Em dinheiro FÍSICO, mostrar saldo antes do servidor confirmar induz o
    // operador a contar errado. A ausência aqui é decisão, não esquecimento.
    expect(DASH).not.toMatch(/onMutate:/);
    expect(DASH).not.toMatch(/setQueryData\(/);
  });
});
